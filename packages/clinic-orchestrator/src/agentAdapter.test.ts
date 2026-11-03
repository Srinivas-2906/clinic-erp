import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { discoverAgentRuntimes } from './agentAdapter.js';

describe('agentAdapter', () => {
  it('discovers runtimes without throwing', async () => {
    const found = await discoverAgentRuntimes();
    assert.ok(Array.isArray(found));
  });
});
