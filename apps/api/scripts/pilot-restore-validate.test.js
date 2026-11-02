import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import Database from 'better-sqlite3';

const root = path.join(import.meta.dirname, '..');

describe('pilot-restore-validate.mjs', () => {
  it('validates an isolated sqlite copy', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-val-'));
    const dbPath = path.join(tmp, 'mini.db');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT, status TEXT, subscription_status TEXT);
      INSERT INTO tenants VALUES ('t1', 'demo', 'active', 'active');
      CREATE TABLE patients (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, phone TEXT, phone_digits TEXT);
      INSERT INTO patients VALUES ('p1', 't1', 'A', '1', '1');
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE appointments (id TEXT PRIMARY KEY);
      CREATE TABLE encounters (id TEXT PRIMARY KEY);
      CREATE TABLE prescriptions (id TEXT PRIMARY KEY);
      CREATE TABLE patient_payments (id TEXT PRIMARY KEY);
      CREATE TABLE audit_log (id TEXT PRIMARY KEY);
    `);
    db.close();

    const res = spawnSync(process.execPath, ['scripts/pilot-restore-validate.mjs'], {
      cwd: root,
      env: { ...process.env, PILOT_RESTORE_DB: dbPath },
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, res.stderr || res.stdout);
    const json = JSON.parse(res.stdout);
    assert.equal(json.ok, true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
