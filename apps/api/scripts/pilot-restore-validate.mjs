#!/usr/bin/env node
/**
 * Validate an isolated SQLite restore artifact (never the live DATABASE_PATH in place).
 * Usage: PILOT_RESTORE_DB=/path/to/restored.db node scripts/pilot-restore-validate.mjs
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const dbPath = process.env.PILOT_RESTORE_DB?.trim();
if (!dbPath) {
  console.error('Set PILOT_RESTORE_DB to an isolated database file path.');
  process.exit(2);
}
const resolved = path.resolve(dbPath);
if (!fs.existsSync(resolved)) {
  console.error(`File not found: ${resolved}`);
  process.exit(2);
}

const livePath = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : null;
if (livePath && resolved === livePath) {
  console.error('Refusing to validate DATABASE_PATH in place — copy to an isolated file first.');
  process.exit(2);
}

const db = new Database(resolved, { readonly: true, fileMustExist: true });

function scalar(sql) {
  return db.prepare(sql).get();
}

const integrity = db.pragma('integrity_check', { simple: true });
const fkRows = db.pragma('foreign_key_check');
const tenantRows = db.prepare(`
  SELECT id, slug, status, subscription_status FROM tenants ORDER BY slug
`).all();

const tableInfo = db.prepare(`PRAGMA table_info(clinical_attachments)`).all();
const hasClinicalAttachments = db.prepare(
  `SELECT name FROM sqlite_master WHERE type='table' AND name='clinical_attachments'`,
).get();
const hasDeletedAt = hasClinicalAttachments && tableInfo.some((c) => c.name === 'deleted_at');
const clinicalAttachmentsSql = !hasClinicalAttachments
  ? null
  : hasDeletedAt
    ? 'SELECT COUNT(*) AS c FROM clinical_attachments WHERE deleted_at IS NULL'
    : 'SELECT COUNT(*) AS c FROM clinical_attachments';

const counts = {
  users: scalar('SELECT COUNT(*) AS c FROM users').c,
  patients: scalar('SELECT COUNT(*) AS c FROM patients').c,
  appointments: scalar('SELECT COUNT(*) AS c FROM appointments').c,
  encounters: scalar('SELECT COUNT(*) AS c FROM encounters').c,
  prescriptions: scalar('SELECT COUNT(*) AS c FROM prescriptions').c,
  clinical_attachments: clinicalAttachmentsSql ? scalar(clinicalAttachmentsSql).c : 0,
  payments: scalar('SELECT COUNT(*) AS c FROM patient_payments').c,
  audit_log: scalar('SELECT COUNT(*) AS c FROM audit_log').c,
};

const orphanPatients = scalar(`
  SELECT COUNT(*) AS c FROM patients p
  LEFT JOIN tenants t ON t.id = p.tenant_id
  WHERE t.id IS NULL
`).c;

const ok = integrity === 'ok' && fkRows.length === 0 && orphanPatients === 0;

console.log(JSON.stringify({
  ok,
  dbPath: resolved,
  integrity_check: integrity,
  fk_violations: fkRows.length,
  orphan_patients: orphanPatients,
  tenant_count: tenantRows.length,
  tenants: tenantRows.map((t) => ({
    slug: t.slug,
    status: t.status,
    subscription_status: t.subscription_status,
  })),
  counts,
}, null, 2));

db.close();
process.exit(ok ? 0 : 1);
