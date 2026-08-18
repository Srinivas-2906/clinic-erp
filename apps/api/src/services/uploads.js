import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = process.env.UPLOADS_DIR || path.join(__dirname, '../../data/uploads');

function extForContentType(contentType = '') {
  const t = contentType.toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  if (t.includes('heic') || t.includes('heif')) return 'heic';
  return 'jpg';
}

export function savePatientUpload(tenantId, { data, contentType, prefix = 'prescription' }) {
  if (!tenantId || !data) throw new Error('Missing upload data');
  const buf = Buffer.from(String(data), 'base64');
  if (!buf.length) throw new Error('Empty file');
  if (buf.length > 8 * 1024 * 1024) throw new Error('File too large (max 8 MB)');

  const dir = path.join(uploadsRoot, tenantId);
  fs.mkdirSync(dir, { recursive: true });
  const ext = extForContentType(contentType);
  const name = `${prefix}-${Date.now()}-${nanoid(6)}.${ext}`;
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, buf);

  return { fileName: name, relativePath: `${tenantId}/${name}` };
}

export function resolveUploadPath(relativePath) {
  const safe = String(relativePath || '').replace(/\.\./g, '');
  const full = path.join(uploadsRoot, safe);
  if (!full.startsWith(uploadsRoot)) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}
