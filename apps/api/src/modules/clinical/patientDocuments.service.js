import { nanoid } from 'nanoid';
import { getDb } from '../../db/index.js';
import { logAudit } from '../../services/clinicAudit.js';
import { saveClinicalDocumentUpload, deleteBinaryUpload } from '../../services/uploads.js';
import { assertCapability, canManagePatients } from '../identity/rolePolicy.js';
import { canViewClinical } from './clinicalPermissions.js';

const MAX_TITLE_LEN = 120;

function rowToDocument(row) {
  if (!row || row.deleted_at) return null;
  const fileName = row.storage_key.includes('/')
    ? row.storage_key.split('/').pop()
    : row.storage_key;
  const fileUrl = `/api/clinic/files/${row.tenant_id}/${fileName}`;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    encounterId: row.encounter_id || null,
    title: row.title || 'Clinical document',
    contentType: row.content_type || 'application/octet-stream',
    byteSize: Number(row.byte_size) || 0,
    storageKey: row.storage_key,
    fileUrl,
    kind: row.kind || 'clinical',
    createdBy: row.created_by || null,
    createdAt: row.created_at,
  };
}

function assertPatientInTenant(patientId, tenantId) {
  const row = getDb().prepare(
    'SELECT id FROM patients WHERE id = ? AND tenant_id = ?',
  ).get(patientId, tenantId);
  if (!row) {
    const err = new Error('Patient not found');
    err.status = 404;
    throw err;
  }
}

function assertEncounterForPatient(encounterId, patientId, tenantId) {
  const row = getDb().prepare(`
    SELECT id FROM encounters
    WHERE id = ? AND patient_id = ? AND tenant_id = ?
  `).get(encounterId, patientId, tenantId);
  if (!row) {
    const err = new Error('Encounter not found for this patient');
    err.status = 400;
    throw err;
  }
}

export function listPatientClinicalDocuments(patientId, tenantId, user) {
  if (!canViewClinical(user)) {
    const err = new Error('Tenant access required');
    err.status = 403;
    throw err;
  }
  assertPatientInTenant(patientId, tenantId);
  const rows = getDb().prepare(`
    SELECT * FROM clinical_attachments
    WHERE tenant_id = ? AND patient_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
  `).all(tenantId, patientId);
  return rows.map((r) => rowToDocument(r)).filter(Boolean);
}

export async function createPatientClinicalDocument(patientId, tenantId, user, body = {}) {
  assertCapability(user, canManagePatients, 'Not allowed to manage patient documents');
  assertPatientInTenant(patientId, tenantId);

  const encounterId = body.encounterId ? String(body.encounterId).trim() : null;
  if (encounterId) {
    assertEncounterForPatient(encounterId, patientId, tenantId);
  }

  let title = String(body.title || body.label || 'Clinical document').trim();
  if (!title) title = 'Clinical document';
  if (title.length > MAX_TITLE_LEN) {
    title = title.slice(0, MAX_TITLE_LEN);
  }

  const saved = await saveClinicalDocumentUpload(tenantId, {
    data: body.data,
    contentType: body.contentType,
  });

  const id = nanoid(12);
  const db = getDb();
  db.prepare(`
    INSERT INTO clinical_attachments (
      id, tenant_id, patient_id, encounter_id, storage_key, content_type,
      kind, title, byte_size, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'clinical', ?, ?, ?, datetime('now'))
  `).run(
    id,
    tenantId,
    patientId,
    encounterId,
    saved.relativePath,
    saved.contentType,
    title,
    saved.byteSize,
    user.sub,
  );

  logAudit(tenantId, user.sub, 'create', 'clinical_attachment', id, {
    patientId,
    encounterId: encounterId || undefined,
    byteSize: saved.byteSize,
  });

  const row = db.prepare('SELECT * FROM clinical_attachments WHERE id = ?').get(id);
  return rowToDocument(row);
}

export function deletePatientClinicalDocument(documentId, patientId, tenantId, user) {
  assertCapability(user, canManagePatients, 'Not allowed to manage patient documents');
  assertPatientInTenant(patientId, tenantId);

  const row = getDb().prepare(`
    SELECT * FROM clinical_attachments
    WHERE id = ? AND tenant_id = ? AND patient_id = ? AND deleted_at IS NULL
  `).get(documentId, tenantId, patientId);

  if (!row) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }

  getDb().prepare(`
    UPDATE clinical_attachments SET deleted_at = datetime('now') WHERE id = ?
  `).run(documentId);

  const fileName = row.storage_key.includes('/')
    ? row.storage_key.split('/').pop()
    : row.storage_key;
  void deleteBinaryUpload(tenantId, fileName).catch(() => {
    logAudit(tenantId, user.sub, 'delete_storage_pending', 'clinical_attachment', documentId, {
      patientId,
      storageKey: row.storage_key,
    });
  });

  logAudit(tenantId, user.sub, 'delete', 'clinical_attachment', documentId, { patientId });
  return { ok: true, id: documentId };
}

/** Gate GET /clinic/files for clinical-doc-* objects — must be registered on a patient. */
export function assertTenantMayReadClinicalFile(tenantId, fileName) {
  if (!String(fileName || '').startsWith('clinical-doc-')) return;
  const row = getDb().prepare(`
    SELECT id FROM clinical_attachments
    WHERE tenant_id = ? AND deleted_at IS NULL
      AND (storage_key = ? OR storage_key LIKE ?)
    LIMIT 1
  `).get(tenantId, `${tenantId}/${fileName}`, `%/${fileName}`);
  if (!row) {
    const err = new Error('File not found');
    err.code = 'NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }
}
