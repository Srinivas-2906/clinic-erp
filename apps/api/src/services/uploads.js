import { nanoid } from 'nanoid';
import {
  decodeBase64Payload,
  validateUploadBuffer,
  validateUploadPrefix,
  validateTenantId,
  validateFileName,
  validationError,
  MAX_UPLOAD_BYTES,
} from './uploadValidation.js';
import { getUploadStorageBackend } from './uploadStorage.js';

/** Server-generated or trusted binary (e.g. prescription PDF). */
export async function saveBinaryUpload(tenantId, { buffer, contentType, prefix = 'prescription-pdf' }) {
  const safeTenant = validateTenantId(tenantId);
  if (!buffer?.length) throw validationError('Missing upload data');
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length > MAX_UPLOAD_BYTES) throw validationError('File too large (max 8 MB)');

  const ct = String(contentType || '').toLowerCase();
  let extension = 'bin';
  if (ct.includes('pdf') || (buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === '%PDF')) {
    extension = 'pdf';
  } else {
    const meta = validateUploadBuffer(buf, contentType);
    extension = meta.extension;
  }

  const safePrefix = validateUploadPrefix(prefix);
  const name = `${safePrefix}-${Date.now()}-${nanoid(6)}.${extension}`;
  validateFileName(name);

  const backend = getUploadStorageBackend();
  await backend.saveObject({
    tenantId: safeTenant,
    fileName: name,
    buffer: buf,
    contentType: extension === 'pdf' ? 'application/pdf' : contentType,
  });

  return {
    fileName: name,
    relativePath: `${safeTenant}/${name}`,
    contentType: extension === 'pdf' ? 'application/pdf' : contentType,
  };
}

export async function savePatientUpload(tenantId, { data, contentType, prefix = 'prescription' }) {
  const safeTenant = validateTenantId(tenantId);
  if (!data) throw validationError('Missing upload data');

  const buf = decodeBase64Payload(data);
  const meta = validateUploadBuffer(buf, contentType);
  const safePrefix = validateUploadPrefix(prefix);

  const name = `${safePrefix}-${Date.now()}-${nanoid(6)}.${meta.extension}`;
  validateFileName(name);

  const backend = getUploadStorageBackend();
  await backend.saveObject({
    tenantId: safeTenant,
    fileName: name,
    buffer: buf,
    contentType: meta.contentType,
  });

  return {
    fileName: name,
    relativePath: `${safeTenant}/${name}`,
    contentType: meta.contentType,
  };
}

/**
 * Opens a readable stream for an uploaded patient file (GCS or local dev backend).
 */
export async function openPatientUploadReadStream(tenantId, fileName) {
  const safeTenant = validateTenantId(tenantId);
  const safeName = validateFileName(fileName);
  const backend = getUploadStorageBackend();
  return backend.openReadStream({ tenantId: safeTenant, fileName: safeName });
}

/** @deprecated use openPatientUploadReadStream — kept for tests migrating off filesystem paths */
export function resolveUploadPath(relativePath) {
  void relativePath;
  return null;
}
