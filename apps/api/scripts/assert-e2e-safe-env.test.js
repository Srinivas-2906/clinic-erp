import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'assert-e2e-safe-env.js');
const e2eDb = path.join(__dirname, '../data/e2e/clinic.db');
const devDb = path.join(__dirname, '../data/clinic.db');

function run(extraEnv = {}) {
  execSync(`node ${script}`, {
    env: { ...process.env, ...extraEnv },
    stdio: 'pipe',
  });
}

describe('assert-e2e-safe-env', () => {
  it('allows isolated e2e database path', () => {
    assert.doesNotThrow(() => run({ DATABASE_PATH: e2eDb }));
  });

  it('blocks default dev clinic.db', () => {
    assert.throws(() => run({ DATABASE_PATH: devDb }), /Refusing/);
  });

  it('blocks staging NODE_ENV', () => {
    assert.throws(() => run({ DATABASE_PATH: e2eDb, NODE_ENV: 'staging' }), /Refusing/);
  });
});
