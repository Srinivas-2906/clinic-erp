import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireLiveTenant } from '../../middleware/requireLiveTenant.js';
import { canManageDoctors } from '../identity/permissions.js';
import { logAudit } from '../../services/clinicAudit.js';
import {
  listDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
} from './doctors.service.js';
import { listDoctorSessions, replaceDoctorSessions } from './doctorSessions.service.js';
import { listDoctorTimeOff, createDoctorTimeOff, deleteDoctorTimeOff } from './doctorTimeOff.service.js';
import { listDoctorServiceIds, replaceDoctorServices } from './doctorServices.service.js';

function tenantGuard(req, res) {
  if (!req.user?.tenantId) {
    res.status(403).json({ error: 'Tenant access required' });
    return null;
  }
  return req.user.tenantId;
}

function handleServiceError(res, err) {
  const status = err.status || 400;
  res.status(status).json({ error: err.message || 'Request failed' });
}

export function doctorsRouter() {
  const router = Router();
  router.use(authMiddleware, requireLiveTenant);

  router.get('/', (req, res) => {
    const tenantId = tenantGuard(req, res);
    if (!tenantId) return;
    const includeInactive = canManageDoctors(req.user) && req.query.includeInactive === '1';
    res.json({ doctors: listDoctors(tenantId, { includeInactive }) });
  });

  router.post('/', (req, res) => {
    const tenantId = tenantGuard(req, res);
    if (!tenantId) return;
    try {
      const doctor = createDoctor(tenantId, req.user, req.body ?? {});
      logAudit(tenantId, req.user.sub, 'create', 'doctor', doctor.id, { name: doctor.name });
      res.status(201).json(doctor);
    } catch (err) {
      handleServiceError(res, err);
    }
  });

  router.get('/:id', (req, res) => {
    const tenantId = tenantGuard(req, res);
    if (!tenantId) return;
    const doctor = getDoctorById(req.params.id, tenantId);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    res.json(doctor);
  });

  router.patch('/:id', (req, res) => {
    const tenantId = tenantGuard(req, res);
    if (!tenantId) return;
    try {
      const doctor = updateDoctor(req.params.id, tenantId, req.user, req.body ?? {});
      const action = req.body?.isActive === false ? 'deactivate' : 'update';
      logAudit(tenantId, req.user.sub, action, 'doctor', doctor.id, req.body ?? {});
      res.json(doctor);
    } catch (err) {
      handleServiceError(res, err);
    }
  });

  router.get('/:id/sessions', (req, res) => {
    const tenantId = tenantGuard(req, res);
    if (!tenantId) return;
    try {
      res.json({ sessions: listDoctorSessions(req.params.id, tenantId) });
    } catch (err) {
      handleServiceError(res, err);
    }
  });

  router.put('/:id/sessions', (req, res) => {
    const tenantId = tenantGuard(req, res);
    if (!tenantId) return;
    try {
      const sessions = replaceDoctorSessions(req.params.id, tenantId, req.user, req.body?.sessions ?? req.body);
      logAudit(tenantId, req.user.sub, 'update', 'doctor_session', req.params.id, { count: sessions.length });
      res.json({ sessions });
    } catch (err) {
      handleServiceError(res, err);
    }
  });

  router.get('/:id/time-off', (req, res) => {
    const tenantId = tenantGuard(req, res);
    if (!tenantId) return;
    try {
      res.json({ timeOff: listDoctorTimeOff(req.params.id, tenantId) });
    } catch (err) {
      handleServiceError(res, err);
    }
  });

  router.post('/:id/time-off', (req, res) => {
    const tenantId = tenantGuard(req, res);
    if (!tenantId) return;
    try {
      const block = createDoctorTimeOff(req.params.id, tenantId, req.user, req.body ?? {});
      logAudit(tenantId, req.user.sub, 'create', 'doctor_time_off', block.id, { doctorId: req.params.id });
      res.status(201).json(block);
    } catch (err) {
      handleServiceError(res, err);
    }
  });

  router.delete('/:id/time-off/:offId', (req, res) => {
    const tenantId = tenantGuard(req, res);
    if (!tenantId) return;
    try {
      deleteDoctorTimeOff(req.params.offId, req.params.id, tenantId, req.user);
      logAudit(tenantId, req.user.sub, 'delete', 'doctor_time_off', req.params.offId, {});
      res.json({ ok: true });
    } catch (err) {
      handleServiceError(res, err);
    }
  });

  router.get('/:id/services', (req, res) => {
    const tenantId = tenantGuard(req, res);
    if (!tenantId) return;
    try {
      res.json({ catalogItemIds: listDoctorServiceIds(req.params.id, tenantId) });
    } catch (err) {
      handleServiceError(res, err);
    }
  });

  router.put('/:id/services', (req, res) => {
    const tenantId = tenantGuard(req, res);
    if (!tenantId) return;
    try {
      const catalogItemIds = replaceDoctorServices(
        req.params.id,
        tenantId,
        req.user,
        req.body?.catalogItemIds ?? [],
      );
      logAudit(tenantId, req.user.sub, 'update', 'doctor_service', req.params.id, { count: catalogItemIds.length });
      res.json({ catalogItemIds });
    } catch (err) {
      handleServiceError(res, err);
    }
  });

  return router;
}
