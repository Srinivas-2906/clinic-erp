import { Router } from 'express';
import { authMiddleware, loginUser, getUserProfile, requireOwner } from '../middleware/auth.js';
import { requireLiveTenant } from '../middleware/requireLiveTenant.js';
import { getClient, getTenantBySlug, getTenantById, setRequestTenant, runWithTenant } from '../tenantContext.js';
import { getCatalogItems, tenantToClient, getDb } from '../db/index.js';
import {
  getPatients, createPatient, updatePatient, getPatientTimeline,
  getAppointments, createAppointment, updateAppointment,
  getTodayStats, getAvailableSlots, getAppointmentsRange,
  PatientIdentityError,
} from '../services/clinicStore.js';

function respondPatientIdentityError(err, res) {
  if (!(err instanceof PatientIdentityError)) return false;
  const status = err.code === 'PATIENT_AMBIGUOUS' ? 409 : 400;
  res.status(status).json({
    error: err.message,
    code: err.code,
    candidates: err.details?.candidates,
  });
  return true;
}
import { createPayment, getPayments, getPaymentsRange, getPaymentSummary, updatePayment } from '../services/clinicPayments.js';
import {
  createInvoice,
  listInvoices,
  getInvoiceById,
  voidInvoice,
  createRefund,
} from '../services/patientInvoices.js';
import { getClinicSettings, updateClinicSettings } from '../services/clinicSettings.js';
import {
  assertCapability,
  canManagePatients,
  canManageAppointments,
} from '../modules/identity/rolePolicy.js';
import { logAudit, queryAuditLog, formatAuditCsv } from '../services/clinicAudit.js';
import { checkAuditExportRateLimit } from '../services/clinicAuditExport.js';
import { getTenantEntitlements, canExportAudit } from '../modules/identity/entitlements.js';
import { requireViewAudit } from '../modules/identity/permissions.js';
import { savePatientUpload, openPatientUploadReadStream } from '../services/uploads.js';
import {
  checkAccessRequestRateLimit,
  submitAccessRequest,
  listAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
  validateInviteToken,
  completePasswordSetup,
} from '../services/accessRequests.js';
import {
  checkForgotPasswordRateLimit,
  requestPasswordReset,
  validateResetToken,
  completePasswordReset,
} from '../services/passwordReset.js';
import {
  checkBookingRateLimit,
  listPublicServices,
  listPublicSlots,
  submitPublicBooking,
} from '../services/publicBooking.js';
import { doctorsRouter } from '../modules/providers/doctors.routes.js';
import { clinicalRouter } from '../modules/clinical/clinical.routes.js';
import { listEncountersForPatient } from '../modules/clinical/encounters.service.js';
import { createRateLimiter } from '../utils/rateLimiter.js';
import {
  isSlugAvailable,
  provisionClinicTenant,
  updateTenantSubscription,
} from '../services/tenantProvisioning.js';
import {
  isPublicSignupEnabled,
  requireProvisioningAuth,
} from '../modules/platform/provisioningAuth.js';
import { processDueReminders } from '../services/reminders/index.js';
import { buildTenantExportBundle } from '../services/tenantExport.js';
import { getPaymentGatewayConfig } from '../modules/billing/paymentGateway.js';
import { requirePlatformAdmin } from '../middleware/requirePlatformAdmin.js';
import {
  listTenantsForPlatformAdmin,
  getTenantDetailForPlatformAdmin,
  patchTenantAsPlatformAdmin,
} from '../modules/platform/platformAdmin.service.js';
import { enqueuePaymentReceiptNotification } from '../services/notificationAutomation.js';
import { requireTenantWrite } from '../middleware/requireTenantWrite.js';
import { assertSubscriptionTransition } from '../modules/identity/subscription.js';
import { normalizePlanId } from '../modules/identity/plans.js';

const checkSignupRateLimit = createRateLimiter({
  max: Number(process.env.SIGNUP_RATE_MAX || 5),
  windowMs: Number(process.env.SIGNUP_RATE_WINDOW_MS || 15 * 60 * 1000),
});

const router = Router();

function withTenant(req, _res, next) {
  const slug = req.query.tenant || req.headers['x-tenant-slug'];
  let tenantId = null;
  if (req.user?.tenantId) {
    tenantId = req.user.tenantId;
  } else if (slug) {
    const tenant = getTenantBySlug(slug);
    if (tenant) tenantId = tenant.id;
  }
  runWithTenant(tenantId, () => {
    if (tenantId) setRequestTenant(tenantId);
    next();
  });
}

router.use(withTenant);

router.post('/login', (req, res) => {
  const { email, identifier, password, tenantSlug } = req.body ?? {};
  const id = identifier || email;
  const inferredTenant = tenantSlug || req.headers['x-tenant-slug'] || req.query.tenant;
  if (!id || !password) return res.status(400).json({ error: 'Email/username and password required' });
  const result = loginUser(id, password, { tenantSlug: inferredTenant });
  if (result.error) return res.status(401).json({ error: result.error });
  res.json(result);
});

router.get('/me', authMiddleware, (req, res) => {
  const profile = getUserProfile(req.user.sub);
  if (!profile) return res.status(404).json({ error: 'User not found' });
  res.json(profile);
});

router.get('/tenant/:slug/public', (req, res) => {
  const tenant = getTenantBySlug(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Business not found' });
  res.json(tenantToClient(tenant));
});

/** Public website booking — no auth (dentacare.kaana.in → clinic-api) */
router.get('/tenant/:slug/booking/services', (req, res) => {
  const tenant = getTenantBySlug(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Business not found' });
  if (tenant.status !== 'active') return res.status(403).json({ error: 'Bookings unavailable' });
  res.json({ services: listPublicServices(tenant.id) });
});

router.get('/tenant/:slug/booking/slots', (req, res) => {
  const tenant = getTenantBySlug(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Business not found' });
  if (tenant.status !== 'active') return res.status(403).json({ error: 'Bookings unavailable' });
  try {
    const date = String(req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    res.json(listPublicSlots(tenant.id, date, {
      doctorId: req.query.doctorId ? String(req.query.doctorId) : undefined,
      serviceId: req.query.serviceId ? String(req.query.serviceId) : undefined,
      anyAvailable: req.query.anyAvailable !== '0',
    }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tenant/:slug/booking', (req, res) => {
  if (!checkBookingRateLimit(req)) {
    return res.status(429).json({ error: 'Too many booking attempts. Please try again later.' });
  }
  const tenant = getTenantBySlug(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Business not found' });
  if (tenant.status !== 'active') return res.status(403).json({ error: 'Bookings unavailable' });
  try {
    const result = submitPublicBooking(tenant.id, req.body ?? {});
    res.status(201).json(result);
  } catch (err) {
    if (respondPatientIdentityError(err, res)) return;
    res.status(400).json({ error: err.message || 'Could not submit booking' });
  }
});

/** Staff access request — no auth */
router.post('/tenant/:slug/access-request', (req, res) => {
  if (!checkAccessRequestRateLimit(req)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  const tenant = getTenantBySlug(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Business not found' });
  try {
    const result = submitAccessRequest(tenant.id, req.body ?? {});
    res.status(result.alreadyPending ? 200 : 201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not submit request' });
  }
});

router.get('/set-password/validate', (req, res) => {
  const token = String(req.query.token || '');
  const result = validateInviteToken(token);
  if (!result.valid) return res.status(400).json(result);
  res.json({ valid: true, email: result.email, name: result.name });
});

router.post('/set-password', (req, res) => {
  const { token, password } = req.body ?? {};
  try {
    const user = completePasswordSetup(token, password);
    res.json({ ok: true, email: user.email, name: user.name });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not set password' });
  }
});

router.post('/tenant/:slug/forgot-password', (req, res) => {
  if (!checkForgotPasswordRateLimit(req)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  const tenant = getTenantBySlug(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Business not found' });
  try {
    const email = req.body?.email;
    const result = requestPasswordReset(tenant.id, email);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not process request' });
  }
});

router.get('/reset-password/validate', (req, res) => {
  const token = String(req.query.token || '');
  const result = validateResetToken(token);
  if (!result.valid) return res.status(400).json(result);
  res.json({ valid: true, email: result.email, name: result.name, purpose: 'reset' });
});

router.post('/reset-password', (req, res) => {
  const { token, password } = req.body ?? {};
  try {
    const user = completePasswordReset(token, password);
    res.json({ ok: true, email: user.email, name: user.name });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not reset password' });
  }
});

router.get('/signup/slug-available', (req, res) => {
  res.json(isSlugAvailable(String(req.query.slug || '')));
});

router.post('/signup', (req, res) => {
  if (!isPublicSignupEnabled()) {
    return res.status(403).json({ error: 'Self-service signup is not enabled on this environment' });
  }
  if (!checkSignupRateLimit(req)) {
    return res.status(429).json({ error: 'Too many signup attempts. Try again later.' });
  }
  try {
    const idempotencyKey = String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '').trim();
    const result = provisionClinicTenant({ ...req.body, idempotencyKey });
    res.status(result.idempotentReplay ? 200 : 201).json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Could not create clinic', code: err.code });
  }
});

router.post('/internal/tenants', requireProvisioningAuth, (req, res) => {
  try {
    const idempotencyKey = String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '').trim();
    const result = provisionClinicTenant({ ...req.body, idempotencyKey });
    res.status(result.idempotentReplay ? 200 : 201).json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Provision failed', code: err.code });
  }
});

router.get('/admin/tenants', authMiddleware, requirePlatformAdmin, (req, res) => {
  const tenants = listTenantsForPlatformAdmin({
    search: req.query.search,
    status: req.query.status,
    limit: req.query.limit,
    offset: req.query.offset,
  });
  res.json({ tenants });
});

router.get('/admin/tenants/:tenantId', authMiddleware, requirePlatformAdmin, (req, res) => {
  try {
    res.json(getTenantDetailForPlatformAdmin(req.params.tenantId));
  } catch (err) {
    res.status(err.status || 404).json({ error: err.message || 'Not found' });
  }
});

router.patch('/admin/tenants/:tenantId', authMiddleware, requirePlatformAdmin, (req, res) => {
  try {
    const detail = patchTenantAsPlatformAdmin(req.user, req.params.tenantId, req.body ?? {});
    res.json(detail);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Update failed', code: err.code });
  }
});

router.get('/internal/tenants', requireProvisioningAuth, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const rows = getDb().prepare(`
    SELECT id, slug, name, plan, status, subscription_status, trial_ends_at, created_at
    FROM tenants ORDER BY datetime(created_at) DESC LIMIT ?
  `).all(limit);
  res.json({ tenants: rows });
});

router.post('/internal/process-reminders', requireProvisioningAuth, (req, res) => {
  const limit = Math.min(Number(req.body?.limit) || 50, 200);
  const results = processDueReminders({ limit });
  res.json({ processed: results.length, results });
});

router.patch('/internal/tenants/:tenantId', requireProvisioningAuth, (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const { subscriptionStatus, planId } = req.body ?? {};
    if (subscriptionStatus !== undefined) {
      const row = getTenantBySlug(tenantId) || getTenantById(tenantId);
      const id = row?.id || tenantId;
      const current = getDb().prepare('SELECT subscription_status FROM tenants WHERE id = ?').get(id);
      if (current) assertSubscriptionTransition(current.subscription_status, subscriptionStatus);
      const tenant = updateTenantSubscription(id, { subscriptionStatus, planId: planId !== undefined ? normalizePlanId(planId) : undefined });
      return res.json({ tenant });
    }
    if (planId !== undefined) {
      const row = getTenantBySlug(tenantId) || getTenantById(tenantId);
      const id = row?.id || tenantId;
      const tenant = updateTenantSubscription(id, { planId: normalizePlanId(planId) });
      return res.json({ tenant });
    }
    res.status(400).json({ error: 'No updates provided' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, code: err.code });
  }
});

export default router;

export function clinicRouter() {
  const api = Router();
  api.use(withTenant);
  api.use(requireTenantWrite);

  api.get('/client', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    setRequestTenant(req.user.tenantId);
    res.json(getClient());
  });

  api.get('/platform/me', authMiddleware, (req, res) => {
    const profile = getUserProfile(req.user.sub);
    if (!profile) return res.status(404).json({ error: 'User not found' });
    res.json(profile);
  });

  api.get('/catalog', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    const items = getCatalogItems(req.user.tenantId).map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      price: item.price,
      priceNum: item.price_num,
      meta: item.meta,
      imageUrl: item.image_url,
      category: item.category,
      status: item.status,
    }));
    res.json(items);
  });

  api.get('/clinic/today', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    res.json(getTodayStats(req.user.tenantId));
  });

  api.use('/clinic/doctors', doctorsRouter());
  api.use('/clinic', clinicalRouter());

  api.get('/patients', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    res.json(getPatients(req.user.tenantId, { search: req.query.search }));
  });

  api.get('/patients/:id', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    const timeline = getPatientTimeline(req.params.id, req.user.tenantId);
    if (!timeline) return res.status(404).json({ error: 'Patient not found' });
    timeline.encounters = listEncountersForPatient(req.params.id, req.user.tenantId);
    res.json(timeline);
  });

  api.post('/patients', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      assertCapability(req.user, canManagePatients, 'Not allowed to register patients');
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
    const { name, phone, email, age, gender, chiefComplaint, isReturning, source, photoUrl, prescriptionUrl, recordUrls } = req.body ?? {};
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    try {
      const patient = createPatient(req.user.tenantId, {
        name, phone, email, age, gender, chiefComplaint, isReturning, source: source || 'Walk-in', photoUrl, prescriptionUrl, recordUrls,
      });
      logAudit(req.user.tenantId, req.user.sub, 'create', 'patient', patient.id, { name });
      res.status(201).json(patient);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  api.patch('/patients/:id', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      assertCapability(req.user, canManagePatients, 'Not allowed to update patients');
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
    const patient = updatePatient(req.params.id, req.user.tenantId, req.body ?? {});
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    logAudit(req.user.tenantId, req.user.sub, 'update', 'patient', patient.id, req.body ?? {});
    res.json(patient);
  });

  api.get('/appointments', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    const { date, from, to, status, patientId } = req.query;
    if (from || to) {
      return res.json(getAppointmentsRange(req.user.tenantId, {
        from: from || to,
        to: to || from,
        status,
        patientId,
        limit: 5000,
      }));
    }
    res.json(getAppointments(req.user.tenantId, {
      date,
      status,
      patientId,
    }));
  });

  api.get('/appointments/slots', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const result = getAvailableSlots(req.user.tenantId, date, {
      doctorId: req.query.doctorId ? String(req.query.doctorId) : undefined,
      serviceId: req.query.serviceId ? String(req.query.serviceId) : undefined,
      anyAvailable: req.query.anyAvailable === '1' || req.query.anyAvailable === 'true',
      durationMin: req.query.durationMin ? Number(req.query.durationMin) : undefined,
      excludeAppointmentId: req.query.excludeAppointmentId ? String(req.query.excludeAppointmentId) : undefined,
      returnDetails: true,
    });
    res.json({ date, slots: result.slots, slotOptions: result.slotOptions });
  });

  api.post('/appointments', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      assertCapability(req.user, canManageAppointments, 'Not allowed to book appointments');
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
    const body = req.body ?? {};
    if (!body.scheduledAt) return res.status(400).json({ error: 'scheduledAt required' });
    try {
      const appt = createAppointment(req.user.tenantId, body);
      logAudit(req.user.tenantId, req.user.sub, 'create', 'appointment', appt.id, { service: body.service });
      res.status(201).json(appt);
    } catch (err) {
      if (respondPatientIdentityError(err, res)) return;
      res.status(400).json({ error: err.message });
    }
  });

  api.patch('/appointments/:id', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      assertCapability(req.user, canManageAppointments, 'Not allowed to update appointments');
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
    const appt = updateAppointment(req.params.id, req.user.tenantId, req.body ?? {});
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    logAudit(req.user.tenantId, req.user.sub, 'update', 'appointment', appt.id, req.body ?? {});
    res.json(appt);
  });

  api.get('/clinic/payments', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    res.json({
      summary: getPaymentSummary(req.user.tenantId),
      payments: getPayments(req.user.tenantId, { patientId: req.query.patientId }),
    });
  });

  api.get('/clinic/report', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    const to = String(req.query.to || new Date().toISOString().slice(0, 10));
    const from = String(req.query.from || to);
    const appointments = getAppointmentsRange(req.user.tenantId, { from, to, limit: 5000 });
    const payments = getPaymentsRange(req.user.tenantId, { from, to, limit: 5000 });
    const summary = getPaymentSummary(req.user.tenantId);
    const total = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    res.json({ from, to, appointments, payments, summary: { ...summary, total } });
  });

  api.post('/clinic/payments', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    const { patientId, appointmentId, amount, method, reference, notes, status } = req.body ?? {};
    if (!patientId || amount == null) return res.status(400).json({ error: 'patientId and amount required' });
    try {
      const payment = createPayment(req.user.tenantId, req.user, {
        patientId,
        appointmentId,
        amount: Number(amount),
        method,
        reference,
        notes,
        status,
        invoiceId: req.body?.invoiceId,
        idempotencyKey: req.body?.idempotencyKey,
      });
      logAudit(req.user.tenantId, req.user.sub, 'create', 'payment', payment.id, { amount });
      try {
        const row = getDb().prepare(`SELECT * FROM patient_payments WHERE id = ?`).get(payment.id);
        if (row) enqueuePaymentReceiptNotification(req.user.tenantId, row);
      } catch { /* non-blocking */ }
      res.status(201).json(payment);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message || 'Could not record payment' });
    }
  });

  api.post('/clinic/payments/:id/refund', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const row = createRefund(req.user.tenantId, req.user, {
        paymentId: req.params.id,
        amount: req.body?.amount != null ? Number(req.body.amount) : undefined,
        notes: req.body?.notes,
        idempotencyKey: req.body?.idempotencyKey,
      });
      res.status(201).json(row);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message || 'Could not refund' });
    }
  });

  api.patch('/clinic/payments/:id', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const payment = updatePayment(req.params.id, req.user.tenantId, req.user, req.body ?? {});
      if (!payment) return res.status(404).json({ error: 'Payment not found' });
      logAudit(req.user.tenantId, req.user.sub, 'update', 'payment', payment.id, req.body ?? {});
      res.json(payment);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message || 'Could not update payment' });
    }
  });

  api.get('/clinic/invoices', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    res.json({
      invoices: listInvoices(req.user.tenantId, {
        patientId: req.query.patientId,
        status: req.query.status,
      }),
    });
  });

  api.get('/clinic/invoices/:id', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    const inv = getInvoiceById(req.params.id, req.user.tenantId);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    res.json(inv);
  });

  api.post('/clinic/invoices', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const inv = createInvoice(req.user.tenantId, req.user, req.body ?? {});
      res.status(201).json(inv);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message || 'Could not create invoice' });
    }
  });

  api.post('/clinic/invoices/:id/void', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const inv = voidInvoice(req.user.tenantId, req.user, req.params.id, { reason: req.body?.reason });
      res.json(inv);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message || 'Could not void invoice' });
    }
  });

  api.get('/clinic/settings', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    const settings = getClinicSettings(req.user.tenantId);
    if (!settings) return res.status(404).json({ error: 'Tenant not found' });
    res.json(settings);
  });

  api.patch('/clinic/settings', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const settings = updateClinicSettings(req.user.tenantId, req.user, req.body ?? {});
      res.json(settings);
    } catch (err) {
      res.status(err.status || 403).json({ error: err.message || 'Could not update settings' });
    }
  });

  api.post('/clinic/uploads', authMiddleware, requireLiveTenant, async (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const { data, contentType, prefix } = req.body ?? {};
      const saved = await savePatientUpload(req.user.tenantId, { data, contentType, prefix: prefix || 'prescription' });
      const publicBase = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
      const url = `${publicBase}/api/clinic/files/${saved.relativePath}`;
      res.status(201).json({ url, path: saved.relativePath });
    } catch (err) {
      const status = err.statusCode || (err.code === 'VALIDATION_ERROR' ? 400 : 500);
      res.status(status).json({ error: err.message || 'Upload failed' });
    }
  });

  api.get('/clinic/files/:tenantId/:fileName', authMiddleware, requireLiveTenant, async (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    if (req.user.tenantId !== req.params.tenantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const opened = await openPatientUploadReadStream(req.params.tenantId, req.params.fileName);
      res.setHeader('Content-Type', opened.contentType);
      res.setHeader('Content-Disposition', opened.contentDisposition || 'inline');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      opened.stream.on('error', () => {
        if (!res.headersSent) res.status(500).json({ error: 'Failed to read file' });
      });
      opened.stream.pipe(res);
    } catch (err) {
      if (err.code === 'NOT_FOUND' || err.statusCode === 404) {
        return res.status(404).json({ error: 'File not found' });
      }
      if (err.code === 'VALIDATION_ERROR') {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Failed to read file' });
    }
  });

  api.get('/clinic/entitlements', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      res.json(getTenantEntitlements(req.user.tenantId));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Could not load plan' });
    }
  });

  api.get('/clinic/audit', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      requireViewAudit(req.user);
      const result = queryAuditLog(req.user.tenantId, {
        limit: req.query.limit,
        offset: req.query.offset,
        action: req.query.action,
        entityType: req.query.entityType,
        from: req.query.from,
        to: req.query.to,
      });
      res.json(result);
    } catch (err) {
      res.status(err.status || 403).json({ error: err.message || 'Forbidden' });
    }
  });

  api.get('/clinic/export', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const bundle = buildTenantExportBundle(req.user.tenantId, req.user);
      res.json(bundle);
    } catch (err) {
      res.status(err.status || 403).json({ error: err.message || 'Export failed' });
    }
  });

  api.get('/clinic/billing/gateway', authMiddleware, requireLiveTenant, requireOwner, (req, res) => {
    res.json(getPaymentGatewayConfig());
  });

  api.get('/clinic/audit/export', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      requireViewAudit(req.user);
      if (!checkAuditExportRateLimit(req)) {
        return res.status(429).json({ error: 'Too many audit exports; try again later' });
      }
      if (!canExportAudit(req.user.tenantId)) {
        return res.status(403).json({ error: 'Audit export is not included in your plan' });
      }
      const csv = formatAuditCsv(req.user.tenantId, {
        action: req.query.action,
        entityType: req.query.entityType,
        from: req.query.from,
        to: req.query.to,
        limit: req.query.limit,
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="clinic-audit.csv"');
      res.send(csv);
    } catch (err) {
      res.status(err.status || 403).json({ error: err.message || 'Forbidden' });
    }
  });

  api.get('/clinic/access-requests', authMiddleware, requireLiveTenant, requireOwner, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    const status = req.query.status ? String(req.query.status) : undefined;
    res.json({ requests: listAccessRequests(req.user.tenantId, { status }) });
  });

  api.post('/clinic/access-requests/:id/approve', authMiddleware, requireLiveTenant, requireOwner, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const result = approveAccessRequest(req.params.id, req.user.tenantId, req.user.sub, req.body ?? {});
      logAudit(req.user.tenantId, req.user.sub, 'approve', 'access_request', req.params.id, { email: result.user.email });
      res.json(result);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message || 'Could not approve request' });
    }
  });

  api.post('/clinic/access-requests/:id/reject', authMiddleware, requireLiveTenant, requireOwner, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const result = rejectAccessRequest(req.params.id, req.user.tenantId, req.user.sub, req.body ?? {});
      logAudit(req.user.tenantId, req.user.sub, 'reject', 'access_request', req.params.id, {});
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Could not reject request' });
    }
  });

  api.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'clinic-api', standalone: true });
  });

  return api;
}
