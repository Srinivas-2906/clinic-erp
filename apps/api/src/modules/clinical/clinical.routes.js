import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireLiveTenant } from '../../middleware/requireLiveTenant.js';
import { openPatientUploadReadStream } from '../../services/uploads.js';
import {
  createEncounter,
  updateEncounterDraft,
  finalizeEncounter,
  amendFinalizedEncounter,
  encounterDetail,
  listEncountersForPatient,
  scheduleFollowUp,
  listPatientAllergies,
  addPatientAllergy,
} from './encounters.service.js';
import { canViewClinical } from './clinicalPermissions.js';

export function clinicalRouter() {
  const r = Router();
  r.use(authMiddleware, requireLiveTenant);

  r.get('/patients/:patientId/encounters', (req, res) => {
    if (!req.user.tenantId || !canViewClinical(req.user)) {
      return res.status(403).json({ error: 'Tenant access required' });
    }
    res.json({ encounters: listEncountersForPatient(req.params.patientId, req.user.tenantId) });
  });

  r.post('/patients/:patientId/encounters', (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const enc = createEncounter(req.user.tenantId, req.user, {
        ...req.body,
        patientId: req.params.patientId,
      });
      res.status(201).json(enc);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
  });

  r.get('/encounters/:id', (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    const enc = encounterDetail(req.params.id, req.user.tenantId);
    if (!enc) return res.status(404).json({ error: 'Encounter not found' });
    res.json(enc);
  });

  r.patch('/encounters/:id', (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const enc = updateEncounterDraft(req.params.id, req.user.tenantId, req.user, req.body ?? {});
      res.json(enc);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
  });

  r.post('/encounters/:id/finalize', async (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const enc = await finalizeEncounter(req.params.id, req.user.tenantId, req.user);
      res.json(enc);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
  });

  r.post('/encounters/:id/amendments', (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const enc = amendFinalizedEncounter(req.params.id, req.user.tenantId, req.user, req.body ?? {});
      res.json(enc);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
  });

  r.post('/encounters/:id/follow-up', (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const fu = scheduleFollowUp(req.params.id, req.user.tenantId, req.user, req.body ?? {});
      res.status(201).json(fu);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  r.get('/encounters/:id/prescription.pdf', async (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    const enc = encounterDetail(req.params.id, req.user.tenantId);
    if (!enc) return res.status(404).json({ error: 'Encounter not found' });
    if (enc.status !== 'finalized') {
      return res.status(403).json({ error: 'Prescription PDF available after consultation is finalized' });
    }
    const key = enc.prescription?.pdfStorageKey;
    if (!key) return res.status(404).json({ error: 'Prescription PDF not available' });
    const fileName = key.includes('/') ? key.split('/').pop() : key;
    try {
      const stream = await openPatientUploadReadStream(req.user.tenantId, fileName);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="prescription-${enc.id}.pdf"`);
      stream.pipe(res);
    } catch (err) {
      res.status(404).json({ error: err.message || 'File not found' });
    }
  });

  r.get('/patients/:patientId/allergies', (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    res.json({ allergies: listPatientAllergies(req.params.patientId, req.user.tenantId) });
  });

  r.post('/patients/:patientId/allergies', (req, res) => {
    if (!req.user.tenantId) return res.status(403).json({ error: 'Tenant access required' });
    try {
      const row = addPatientAllergy(req.params.patientId, req.user.tenantId, req.user, req.body ?? {});
      res.status(201).json(row);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  return r;
}
