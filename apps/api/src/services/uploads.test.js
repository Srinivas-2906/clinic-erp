import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'stream';
import { buffer } from 'stream/consumers';
import {
  createMemoryUploadStorage,
  setUploadStorageBackendForTests,
  resetUploadStorageBackendForTests,
} from './uploadStorage.js';
import { savePatientUpload, openPatientUploadReadStream } from './uploads.js';

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('patient uploads (memory storage)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.CLINIC_FILES_STORAGE = 'memory';
    process.env.CLINIC_FILES_PREFIX = 'clinic-files';
    setUploadStorageBackendForTests(createMemoryUploadStorage());
  });

  afterEach(() => {
    resetUploadStorageBackendForTests();
  });

  it('uploads and downloads for same tenant', async () => {
    const saved = await savePatientUpload('denta-care', {
      data: TINY_PNG_B64,
      contentType: 'image/png',
      prefix: 'prescription',
    });
    assert.match(saved.relativePath, /^denta-care\/prescription-\d+-[a-zA-Z0-9_-]+\.png$/);
    assert.match(saved.fileName, /\.png$/);

    const opened = await openPatientUploadReadStream('denta-care', saved.fileName);
    assert.equal(opened.contentType, 'image/png');
    const body = await buffer(opened.stream);
    assert.ok(body.length > 0);
  });

  it('rejects cross-tenant read via validation on tenant segment', async () => {
    const saved = await savePatientUpload('tenant-a', {
      data: TINY_PNG_B64,
      contentType: 'image/png',
    });
    await assert.rejects(
      () => openPatientUploadReadStream('tenant-b', saved.fileName),
      (err) => err.code === 'NOT_FOUND' || err.statusCode === 404,
    );
  });

  it('returns not found for missing object', async () => {
    await assert.rejects(
      () => openPatientUploadReadStream('denta-care', 'prescription-1-nope.png'),
      (err) => err.code === 'NOT_FOUND',
    );
  });

  it('does not overwrite when two uploads get distinct keys', async () => {
    const a = await savePatientUpload('denta-care', { data: TINY_PNG_B64, contentType: 'image/png' });
    const b = await savePatientUpload('denta-care', { data: TINY_PNG_B64, contentType: 'image/png' });
    assert.notEqual(a.fileName, b.fileName);
  });

  it('propagates GCS-style backend failure without URL', async () => {
    setUploadStorageBackendForTests({
      async saveObject() {
        const err = new Error('GCS unavailable');
        err.code = 'GCS_ERROR';
        throw err;
      },
      async openReadStream() {
        throw new Error('unused');
      },
    });
    await assert.rejects(
      () => savePatientUpload('denta-care', { data: TINY_PNG_B64, contentType: 'image/png' }),
      /GCS unavailable/,
    );
  });
});

describe('failing storage read', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.CLINIC_FILES_STORAGE = 'memory';
    setUploadStorageBackendForTests({
      async saveObject({ tenantId, fileName, buffer, contentType }) {
        return { objectKey: `clinic-files/${tenantId}/${fileName}`, contentType };
      },
      async openReadStream() {
        const err = new Error('read fail');
        err.code = 'GCS_ERROR';
        throw err;
      },
    });
  });

  afterEach(() => resetUploadStorageBackendForTests());

  it('surfaces read errors that are not NOT_FOUND', async () => {
    await assert.rejects(
      () => openPatientUploadReadStream('denta-care', 'prescription-1-abc.png'),
      /read fail/,
    );
  });
});
