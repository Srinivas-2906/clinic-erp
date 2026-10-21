import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getClinicFilesConfig } from '../config/clinicFiles.js';

describe('clinicFiles config', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('requires bucket in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CLINIC_FILES_STORAGE;
    delete process.env.CLINIC_FILES_BUCKET;
    assert.throws(() => getClinicFilesConfig(), /CLINIC_FILES_BUCKET/);
  });

  it('forbids local storage mode in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.CLINIC_FILES_BUCKET = 'my-bucket';
    process.env.CLINIC_FILES_STORAGE = 'local';
    assert.throws(() => getClinicFilesConfig(), /must be gcs/);
  });

  it('allows local mode in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.CLINIC_FILES_STORAGE = 'local';
    delete process.env.CLINIC_FILES_BUCKET;
    const cfg = getClinicFilesConfig();
    assert.equal(cfg.storageMode, 'local');
  });
});
