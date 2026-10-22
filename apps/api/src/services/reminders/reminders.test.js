import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-reminders-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';

const { initDatabase, getDb } = await import('../../db/index.js');
const {
  initReminderInfrastructure,
  enqueueReminder,
  processDueReminders,
  setReminderProvider,
} = await import('./index.js');
const { createMockReminderProvider } = await import('./mockProvider.js');

const tenantId = 't1';

before(() => {
  initDatabase();
  initReminderInfrastructure();
  setReminderProvider(createMockReminderProvider());
  getDb().prepare(`
    INSERT INTO tenants (id, slug, name, industry, plan, status, settings)
    VALUES (?, 'slug', 'Clinic', 'clinic', 'growth', 'active', '{}')
  `).run(tenantId);
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('reminders', () => {
  it('delivers due mock jobs', () => {
    const id = enqueueReminder({
      tenantId,
      kind: 'appointment_reminder',
      recipient: '+91 99999 00000',
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
    });
    const results = processDueReminders({ now: new Date() });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, id);
    assert.equal(results[0].status, 'delivered');
  });

  it('retries failed delivery then marks failed', () => {
    let calls = 0;
    setReminderProvider({
      id: 'mock-fail',
      send() {
        calls += 1;
        throw new Error('simulated failure');
      },
    });
    const id = enqueueReminder({
      tenantId,
      kind: 'test',
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
    });
    for (let i = 0; i < 4; i += 1) {
      processDueReminders({ now: new Date(Date.now() + (i + 1) * 120_000) });
    }
    const row = getDb().prepare('SELECT status, attempts FROM reminder_jobs WHERE id = ?').get(id);
    assert.equal(row.status, 'failed');
    assert.ok(row.attempts >= 3);
    setReminderProvider(createMockReminderProvider());
  });
});
