/**
 * Upload validation: size, base64, allowlisted image types, magic-byte sniffing.
 * Extension is derived from detected type, not client contentType alone.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Types allowed today (Clinic prescription/photo uploads — images only). */
export const ALLOWED_DETECTED_TYPES = new Set(['jpeg', 'png', 'webp', 'heic']);

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function decodeBase64Payload(data) {
  if (data == null || data === '') {
    throw validationError('Missing upload data');
  }
  const raw = String(data).trim();
  const b64 = raw.includes(',') ? raw.split(',').pop() : raw;
  if (!b64 || !/^[A-Za-z0-9+/]+=*$/.test(b64.replace(/\s/g, ''))) {
    throw validationError('Invalid base64 data');
  }
  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    throw validationError('Invalid base64 data');
  }
  if (!buf.length) throw validationError('Empty file');
  if (buf.length > MAX_UPLOAD_BYTES) throw validationError('File too large (max 8 MB)');
  return buf;
}

export function detectImageType(buf) {
  if (buf.length >= 3 && buf.subarray(0, 3).equals(JPEG)) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG)) return 'png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF') {
    if (buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  }
  if (buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii').toLowerCase();
    if (brand.startsWith('heic') || brand.startsWith('heif') || brand.startsWith('mif1')) {
      return 'heic';
    }
  }
  return null;
}

export function extensionForDetectedType(type) {
  switch (type) {
    case 'jpeg': return 'jpg';
    case 'png': return 'png';
    case 'webp': return 'webp';
    case 'heic': return 'heic';
    default: return 'bin';
  }
}

export function contentTypeForDetectedType(type) {
  switch (type) {
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    default: return 'application/octet-stream';
  }
}

/**
 * Validates buffer; returns trusted metadata. Rejects contentType/buffer mismatch.
 */
export function validateUploadBuffer(buf, clientContentType = '') {
  const detected = detectImageType(buf);
  if (!detected || !ALLOWED_DETECTED_TYPES.has(detected)) {
    throw validationError('Unsupported or unrecognized file type');
  }
  const client = String(clientContentType || '').toLowerCase();
  if (client) {
    const ok =
      (detected === 'jpeg' && (client.includes('jpeg') || client.includes('jpg')))
      || (detected === 'png' && client.includes('png'))
      || (detected === 'webp' && client.includes('webp'))
      || (detected === 'heic' && (client.includes('heic') || client.includes('heif')));
    if (!ok) {
      throw validationError('File content does not match declared content type');
    }
  }
  return {
    detectedType: detected,
    contentType: contentTypeForDetectedType(detected),
    extension: extensionForDetectedType(detected),
  };
}

const SAFE_PREFIX = /^[a-z0-9_-]{1,32}$/i;
const SAFE_FILE = /^[a-z0-9_.-]{1,200}$/i;

export function validateTenantId(tenantId) {
  const t = String(tenantId || '').trim();
  if (!t || t.includes('/') || t.includes('\\') || t.includes('..') || t.includes('\0')) {
    throw validationError('Invalid tenant');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) throw validationError('Invalid tenant');
  return t;
}

export function validateUploadPrefix(prefix) {
  const p = String(prefix || 'prescription').trim();
  if (!p || !SAFE_PREFIX.test(p)) throw validationError('Invalid upload prefix');
  return p;
}

/** Single-segment file name for GET :fileName — rejects traversal and path separators. */
export function validateFileName(fileName) {
  const name = String(fileName || '').trim();
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..') || name.includes('\0')) {
    throw validationError('Invalid file name');
  }
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    throw validationError('Invalid file name');
  }
  if (decoded !== name || !SAFE_FILE.test(name)) {
    throw validationError('Invalid file name');
  }
  return name;
}

export function validationError(message) {
  const err = new Error(message);
  err.code = 'VALIDATION_ERROR';
  err.statusCode = 400;
  return err;
}
