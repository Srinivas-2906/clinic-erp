#!/usr/bin/env node
/**
 * Compare clinical file metadata in SQLite with storage backend (memory/local/GCS).
 * Does not download file contents — existence check only.
 *
 * Env: DATABASE_PATH (read-only open), CLINIC_FILES_* same as API.
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.PILOT_RESTORE_DB || process.env.DATABASE_PATH;
if (!dbPath || !fs.existsSync(path.resolve(dbPath))) {
  console.error('Set PILOT_RESTORE_DB or DATABASE_PATH to a readable SQLite file.');
  process.exit(2);
}

process.chdir(path.join(__dirname, '..'));
const { getUploadStorageBackend } = await import('../src/services/uploadStorage.js');

const db = new Database(path.resolve(dbPath), { readonly: true });
const backend = getUploadStorageBackend();

function fileNameFromKey(storageKey, tenantId) {
  const key = String(storageKey || '');
  if (key.includes('/')) return key.split('/').pop();
  return key;
}

async function exists(tenantId, fileName) {
  try {
    const opened = await backend.openReadStream({ tenantId, fileName });
    if (opened.stream?.destroy) opened.stream.destroy();
    return true;
  } catch (err) {
    if (err.code === 'NOT_FOUND' || err.statusCode === 404) return false;
    throw err;
  }
}

const docTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='clinical_attachments'`).get();
let docRows = [];
if (docTable) {
  const hasDeleted = db.prepare(`PRAGMA table_info(clinical_attachments)`).all()
    .some((c) => c.name === 'deleted_at');
  docRows = db.prepare(hasDeleted
    ? `SELECT id, tenant_id, storage_key FROM clinical_attachments WHERE deleted_at IS NULL`
    : `SELECT id, tenant_id, storage_key FROM clinical_attachments`).all();
}
const rxRows = db.prepare(`
  SELECT tenant_id, pdf_storage_key FROM prescriptions
  WHERE pdf_storage_key IS NOT NULL AND pdf_storage_key != ''
`).all();

const missing = [];
const checked = [];

for (const row of docRows) {
  const fileName = fileNameFromKey(row.storage_key, row.tenant_id);
  const ok = await exists(row.tenant_id, fileName);
  checked.push({ kind: 'clinical_attachment', id: row.id, fileName, ok });
  if (!ok) missing.push({ kind: 'clinical_attachment', id: row.id, tenantId: row.tenant_id, fileName });
}

for (const row of rxRows) {
  const fileName = fileNameFromKey(row.pdf_storage_key, row.tenant_id);
  if (!fileName) continue;
  const ok = await exists(row.tenant_id, fileName);
  checked.push({ kind: 'prescription_pdf', fileName, ok });
  if (!ok) missing.push({ kind: 'prescription_pdf', tenantId: row.tenant_id, fileName });
}

db.close();

const report = {
  ok: missing.length === 0,
  storageMode: process.env.CLINIC_FILES_STORAGE || '(default from config)',
  checked: checked.length,
  missing_count: missing.length,
  missing: missing.slice(0, 50),
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
