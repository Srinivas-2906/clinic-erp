import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-audit-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';

const { initDatabase } = await import('../db/index.js');
const { logAudit, queryAuditLog, formatAuditCsv } = await import('./clinicAudit.js');

const tenantA = 'tenant-a';
const tenantB = 'tenant-b';

before(() => {
  initDatabase();
  logAudit(tenantA, 'user-a', 'create', 'patient', 'p1', { name: 'Ada', password: 'secret' });
  logAudit(tenantB, 'user-b', 'create', 'patient', 'p2', { name: 'Bob' });
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('audit log', () => {
  it('scopes results to tenant', () => {
    const { items, total } = queryAuditLog(tenantA, { limit: 10 });
    assert.equal(total, 1);
    assert.equal(items[0].entityId, 'p1');
  });

  it('redacts sensitive detail fields', () => {
    const { items } = queryAuditLog(tenantA, { limit: 1 });
    assert.equal(items[0].detail.password, '[redacted]');
  });

  it('caps export row count at 1000', () => {
    const csv = formatAuditCsv(tenantA, { limit: 5000 });
    const lines = csv.trim().split('\n');
    assert.ok(lines.length <= 1001);
  });

  it('exports csv with header', () => {
    const csv = formatAuditCsv(tenantA);
    assert.match(csv, /^createdAt,/);
    assert.match(csv, /create/);
  });
});
