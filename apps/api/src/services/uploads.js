import { nanoid } from 'nanoid';
import {
  decodeBase64Payload,
  validateUploadBuffer,
  validateUploadPrefix,
  validateTenantId,
  validateFileName,
  validationError,
} from './uploadValidation.js';
import { getUploadStorageBackend } from './uploadStorage.js';

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
