import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { litestreamReplicaRequiredFromEnv } from './litestreamStartupPolicy.js';

describe('litestreamStartupPolicy', () => {
  it('requires replica in production when bucket set', () => {
    assert.equal(
      litestreamReplicaRequiredFromEnv({ NODE_ENV: 'production', LITESTREAM_BUCKET: 'b' }),
      true,
    );
  });

  it('allows optional replica in development', () => {
    assert.equal(
      litestreamReplicaRequiredFromEnv({ NODE_ENV: 'development', LITESTREAM_BUCKET: 'b' }),
      false,
    );
  });

  it('honours explicit CLINIC_REQUIRE_LITESTREAM_REPLICA=0', () => {
    assert.equal(
      litestreamReplicaRequiredFromEnv({
        NODE_ENV: 'production',
        LITESTREAM_BUCKET: 'b',
        CLINIC_REQUIRE_LITESTREAM_REPLICA: '0',
      }),
      false,
    );
  });
});
