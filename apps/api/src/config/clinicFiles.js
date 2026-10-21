/**
 * Durable clinic file storage configuration.
 *
 * Production (NODE_ENV=production): requires GCS bucket + prefix; no silent /data/uploads fallback.
 * Local dev: set CLINIC_FILES_STORAGE=local and optional UPLOADS_DIR for filesystem testing.
 * Tests: CLINIC_FILES_STORAGE=memory (in-process fake; never touches GCS).
 */

export function getClinicFilesConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const storageMode = (process.env.CLINIC_FILES_STORAGE || '').trim().toLowerCase()
    || (nodeEnv === 'production' ? 'gcs' : 'local');

  if (storageMode === 'memory') {
    const prefix = normalizePrefix(process.env.CLINIC_FILES_PREFIX || 'clinic-files');
    return { nodeEnv, storageMode: 'memory', bucket: '', prefix, uploadsDir: '' };
  }

  const bucket = (process.env.CLINIC_FILES_BUCKET || '').trim();
  const prefix = normalizePrefix(process.env.CLINIC_FILES_PREFIX || 'clinic-files');
  const uploadsDir = process.env.UPLOADS_DIR || '';

  if (nodeEnv === 'production') {
    if (storageMode !== 'gcs') {
      throw new Error(
        'CLINIC_FILES_STORAGE must be gcs in production (no /data/uploads fallback)',
      );
    }
    if (!bucket) {
      throw new Error('CLINIC_FILES_BUCKET is required in production');
    }
  }

  if (storageMode === 'gcs' && !bucket && nodeEnv !== 'production') {
    throw new Error('CLINIC_FILES_BUCKET is required when CLINIC_FILES_STORAGE=gcs');
  }

  return {
    nodeEnv,
    storageMode,
    bucket,
    prefix,
    uploadsDir,
  };
}

export function normalizePrefix(raw) {
  return String(raw || 'clinic-files')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/');
}

/** Object key under bucket: clinic-files/{tenantId}/{fileName} */
export function buildObjectKey(prefix, tenantId, fileName) {
  return `${prefix}/${tenantId}/${fileName}`;
}
