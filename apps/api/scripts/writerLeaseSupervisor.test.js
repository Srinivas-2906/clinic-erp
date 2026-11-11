import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { superviseWriterLease } from './writerLeaseSupervisor.mjs';

function mockChild() {
  const child = new EventEmitter();
  child.kill = () => child.emit('exit', 0, null);
  setImmediate(() => child.emit('exit', 0, null));
  return child;
}

describe('writerLeaseSupervisor', () => {
  it('starts child only after lease-not-required path (no GCS)', async () => {
    let childStarted = false;
    const result = await superviseWriterLease({
      leaseRequired: false,
      startChild: () => {
        childStarted = true;
        return mockChild();
      },
    });
    assert.equal(result.ok, true);
    assert.equal(childStarted, true);
  });
});
