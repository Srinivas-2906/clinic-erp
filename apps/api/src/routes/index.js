import { Router } from 'express';
import { authMiddleware, loginUser, getUserProfile, requireOwner } from '../middleware/auth.js';
import { requireLiveTenant } from '../middleware/requireLiveTenant.js';
import { getClient, getTenantBySlug, setRequestTenant, runWithTenant } from '../tenantContext.js';
import { getCatalogItems, tenantToClient } from '../db/index.js';
import {
  getPatients, createPatient, updatePatient, getPatientTimeline,
  getAppointments, createAppointment, updateAppointment,
  getTodayStats, getAvailableSlots, getAppointmentsRange,
} from '../services/clinicStore.js';
import { createPayment, getPayments, getPaymentsRange, getPaymentSummary, updatePayment } from '../services/clinicPayments.js';
import { logAudit } from '../services/clinicAudit.js';
import { savePatientUpload, resolveUploadPath } from '../services/uploads.js';
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
  checkBookingRateLimit,
  listPublicServices,
  listPublicSlots,
  submitPublicBooking,
} from '../services/publicBooking.js';
import { doctorsRouter } from '../modules/providers/doctors.routes.js';

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

export default router;

export function clinicRouter() {
  const api = Router();
  api.use(withTenant);

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

  api.get('/patients', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    res.json(getPatients(req.user.tenantId, { search: req.query.search }));
  });

  api.get('/patients/:id', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    const timeline = getPatientTimeline(req.params.id, req.user.tenantId);
    if (!timeline) return res.status(404).json({ error: 'Patient not found' });
    res.json(timeline);
  });

  api.post('/patients', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
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
    const body = req.body ?? {};
    if (!body.scheduledAt) return res.status(400).json({ error: 'scheduledAt required' });
    try {
      const appt = createAppointment(req.user.tenantId, body);
      logAudit(req.user.tenantId, req.user.sub, 'create', 'appointment', appt.id, { service: body.service });
      res.status(201).json(appt);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  api.patch('/appointments/:id', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
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
    const payment = createPayment(req.user.tenantId, { patientId, appointmentId, amount: Number(amount), method, reference, notes, status });
    logAudit(req.user.tenantId, req.user.sub, 'create', 'payment', payment.id, { amount });
    res.status(201).json(payment);
  });

  api.patch('/clinic/payments/:id', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    const payment = updatePayment(req.params.id, req.user.tenantId, req.body ?? {});
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    logAudit(req.user.tenantId, req.user.sub, 'update', 'payment', payment.id, req.body ?? {});
    res.json(payment);
  });

  api.post('/clinic/uploads', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const { data, contentType, prefix } = req.body ?? {};
      const saved = savePatientUpload(req.user.tenantId, { data, contentType, prefix: prefix || 'prescription' });
      const publicBase = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
      const url = `${publicBase}/api/clinic/files/${saved.relativePath}`;
      res.status(201).json({ url, path: saved.relativePath });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Upload failed' });
    }
  });

  api.get('/clinic/files/:tenantId/:fileName', authMiddleware, requireLiveTenant, (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    if (req.user.tenantId !== req.params.tenantId) return res.status(403).json({ error: 'Forbidden' });
    const full = resolveUploadPath(`${req.params.tenantId}/${req.params.fileName}`);
    if (!full) return res.status(404).json({ error: 'File not found' });
    res.sendFile(full);
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
      res.status(400).json({ error: err.message || 'Could not approve request' });
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
