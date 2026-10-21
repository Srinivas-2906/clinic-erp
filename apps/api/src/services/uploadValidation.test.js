import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeBase64Payload,
  validateUploadBuffer,
  validateFileName,
  validateTenantId,
  MAX_UPLOAD_BYTES,
  detectImageType,
} from './uploadValidation.js';

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('uploadValidation', () => {
  it('decodes valid base64', () => {
    const buf = decodeBase64Payload(TINY_PNG_B64);
    assert.equal(detectImageType(buf), 'png');
  });

  it('rejects invalid base64', () => {
    assert.throws(() => decodeBase64Payload('not!!!base64'), /Invalid base64/);
  });

  it('rejects oversize payload', () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 1).toString('base64');
    assert.throws(() => decodeBase64Payload(big), /too large/i);
  });

  it('validates png buffer and content type', () => {
    const buf = decodeBase64Payload(TINY_PNG_B64);
    const meta = validateUploadBuffer(buf, 'image/png');
    assert.equal(meta.extension, 'png');
    assert.equal(meta.contentType, 'image/png');
  });

  it('rejects content type mismatch', () => {
    const buf = decodeBase64Payload(TINY_PNG_B64);
    assert.throws(
      () => validateUploadBuffer(buf, 'image/jpeg'),
      /does not match/,
    );
  });

  it('rejects traversal in fileName', () => {
    assert.throws(() => validateFileName('../etc/passwd'), /Invalid file name/);
    assert.throws(() => validateFileName('a/b'), /Invalid file name/);
    assert.throws(() => validateFileName('a\\b'), /Invalid file name/);
  });

  it('rejects bad tenant ids', () => {
    assert.throws(() => validateTenantId('a/b'), /Invalid tenant/);
    assert.throws(() => validateTenantId('..'), /Invalid tenant/);
  });
});
