import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPRESS_JSON_LIMIT,
  MAX_JSON_BODY_BYTES,
  MAX_UPLOAD_BYTES,
  jsonBodyParserOptions,
} from './httpBodyLimits.js';

describe('httpBodyLimits', () => {
  it('keeps transport limit above base64 expansion of max decoded upload', () => {
    const maxB64 = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4;
    const jsonOverhead = 256;
    assert.ok(MAX_JSON_BODY_BYTES >= maxB64 + jsonOverhead);
    assert.equal(MAX_UPLOAD_BYTES, 8 * 1024 * 1024);
  });

  it('uses bounded express json limit string', () => {
    assert.equal(jsonBodyParserOptions().limit, EXPRESS_JSON_LIMIT);
    assert.equal(EXPRESS_JSON_LIMIT, '12mb');
  });
});
