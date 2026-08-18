#!/usr/bin/env node
/**
 * Copy clinic tenant data from legacy kaana.db (botiq-whatsapp-server) into clinic-api SQLite.
 *
 * Usage:
 *   node scripts/migrate-from-kaana-db.js --source ../botiq-whatsapp-server/data/kaana.db --tenant dentacare
 *   node scripts/migrate-from-kaana-db.js --source /tmp/kaana.db --tenant dentacare --target ./data/clinic.db
 *
 * Production (litestream replica):
 *   npm run migrate:prod-download
 *   # or manually:
 *   litestream restore -o /tmp/kaana.db gcs://kaana-prod-db/kaana.db
 *   node scripts/migrate-from-kaana-db.js --source /tmp/kaana.db --tenant dentacare
 *   litestream replicate -exec "sleep 30" ./data/clinic.db gcs://kaana-prod-db/clinic.db
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const SLUG_ALIASES = {
  dentacare: ['dentacare', 'denta-care', 'ajithdentacare'],
};

function parseArgs(argv) {
  const args = { tenant: 'dentacare', source: '', target: path.join(ROOT, 'data/clinic.db'), dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') args.source = argv[++i];
    else if (a === '--target') args.target = argv[++i];
    else if (a === '--tenant') args.tenant = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help') {
      console.log(`Usage: node scripts/migrate-from-kaana-db.js --source <kaana.db> [--tenant dentacare] [--target clinic.db]`);
      process.exit(0);
    }
  }
  if (!args.source) {
    console.error('Missing --source path to kaana.db');
    process.exit(1);
  }
  if (!fs.existsSync(args.source)) {
    console.error(`Source not found: ${args.source}`);
    process.exit(1);
  }
  return args;
}

function tableExists(db, name) {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name);
}

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function copyRows(source, target, table, whereSql, params, { dryRun = false } = {}) {
  if (!tableExists(source, table)) {
    console.log(`  skip ${table} (missing in source)`);
    return 0;
  }
  const srcCols = columns(source, table);
  const tgtCols = columns(target, table);
  const shared = srcCols.filter((c) => tgtCols.includes(c));
  if (!shared.length) {
    console.log(`  skip ${table} (no shared columns)`);
    return 0;
  }
  const rows = source.prepare(`SELECT ${shared.join(', ')} FROM ${table} ${whereSql}`).all(...params);
  if (!rows.length) return 0;

  const placeholders = shared.map(() => '?').join(', ');
  const insert = target.prepare(
    `INSERT OR REPLACE INTO ${table} (${shared.join(', ')}) VALUES (${placeholders})`,
  );

  if (!dryRun) {
    const tx = target.transaction((items) => {
      for (const row of items) insert.run(...shared.map((c) => row[c]));
    });
    tx(rows);
  }
  return rows.length;
}

function initTargetSchema(target) {
  // Minimal schema — matches src/db/index.js
  target.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      industry TEXT DEFAULT 'clinic',
      plan TEXT DEFAULT 'growth',
      status TEXT DEFAULT 'active',
      trial_ends_at TEXT,
      settings TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      username TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'owner',
      is_platform_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_username ON users(tenant_id, username);
    CREATE TABLE IF NOT EXISTS catalog_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT DEFAULT '',
      price TEXT DEFAULT '',
      price_num REAL DEFAULT 0,
      meta TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      category TEXT DEFAULT '',
      status TEXT DEFAULT 'Available',
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      phone_digits TEXT NOT NULL,
      email TEXT DEFAULT '',
      age INTEGER,
      gender TEXT DEFAULT '',
      chief_complaint TEXT DEFAULT '',
      is_returning INTEGER DEFAULT 0,
      tags TEXT DEFAULT '[]',
      notes TEXT DEFAULT '[]',
      last_visit TEXT,
      source TEXT DEFAULT 'Walk-in',
      photo_url TEXT DEFAULT '',
      prescription_url TEXT DEFAULT '',
      record_urls TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, phone_digits)
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      service TEXT DEFAULT '',
      service_id TEXT,
      scheduled_at TEXT NOT NULL,
      duration_min INTEGER DEFAULT 30,
      status TEXT DEFAULT 'requested',
      assigned_doctor TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      source TEXT DEFAULT 'Walk-in',
      reminder_sent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS patient_payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      appointment_id TEXT,
      amount REAL NOT NULL DEFAULT 0,
      method TEXT DEFAULT 'cash',
      reference TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'paid',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      detail TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function resolveTenant(source, slug) {
  const aliases = SLUG_ALIASES[slug] || [slug];
  for (const s of aliases) {
    const row = source.prepare('SELECT * FROM tenants WHERE slug = ?').get(s);
    if (row) return row;
  }
  const row = source.prepare('SELECT * FROM tenants WHERE id = ?').get(slug);
  return row || null;
}

function main() {
  const args = parseArgs(process.argv);
  console.log(`\nClinic DB migration`);
  console.log(`  source: ${args.source}`);
  console.log(`  target: ${args.target}`);
  console.log(`  tenant: ${args.tenant}`);
  if (args.dryRun) console.log(`  mode:   DRY RUN\n`);

  fs.mkdirSync(path.dirname(args.target), { recursive: true });

  const source = new Database(args.source, { readonly: true });
  const target = new Database(args.target);
  target.pragma('journal_mode = WAL');
  target.pragma('foreign_keys = OFF');

  initTargetSchema(target);

  const tenant = resolveTenant(source, args.tenant);
  if (!tenant) {
    console.error(`Tenant not found in source for slug/id: ${args.tenant}`);
    process.exit(1);
  }
  console.log(`\nFound tenant: ${tenant.name} (${tenant.id} / ${tenant.slug})\n`);

  if (!args.dryRun) {
    target.prepare('DELETE FROM audit_log WHERE tenant_id = ?').run(tenant.id);
    target.prepare('DELETE FROM patient_payments WHERE tenant_id = ?').run(tenant.id);
    target.prepare('DELETE FROM appointments WHERE tenant_id = ?').run(tenant.id);
    target.prepare('DELETE FROM patients WHERE tenant_id = ?').run(tenant.id);
    target.prepare('DELETE FROM catalog_items WHERE tenant_id = ?').run(tenant.id);
    target.prepare('DELETE FROM users WHERE tenant_id = ?').run(tenant.id);
    target.prepare('DELETE FROM tenants WHERE id = ?').run(tenant.id);
  }

  const counts = {};
  const opts = { dryRun: args.dryRun };
  counts.tenants = copyRows(source, target, 'tenants', 'WHERE id = ?', [tenant.id], opts);
  counts.users = copyRows(source, target, 'users', 'WHERE tenant_id = ?', [tenant.id], opts);
  counts.catalog_items = copyRows(source, target, 'catalog_items', 'WHERE tenant_id = ?', [tenant.id], opts);
  counts.patients = copyRows(source, target, 'patients', 'WHERE tenant_id = ?', [tenant.id], opts);
  counts.appointments = copyRows(source, target, 'appointments', 'WHERE tenant_id = ?', [tenant.id], opts);

  if (tableExists(source, 'patient_payments')) {
    counts.patient_payments = copyRows(source, target, 'patient_payments', 'WHERE tenant_id = ?', [tenant.id], opts);
  }
  if (tableExists(source, 'audit_log')) {
    counts.audit_log = copyRows(source, target, 'audit_log', 'WHERE tenant_id = ?', [tenant.id], opts);
  }

  target.pragma('foreign_keys = ON');
  // Ensure all migrated rows are in the main db file before litestream upload.
  target.pragma('wal_checkpoint(TRUNCATE)');
  source.close();
  target.close();

  console.log('\nMigrated rows:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log(`\nDone → ${args.target}\n`);
}

main();
