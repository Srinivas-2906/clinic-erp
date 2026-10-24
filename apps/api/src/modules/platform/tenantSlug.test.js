import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateTenantSlug, slugFromClinicName } from './tenantSlug.js';

describe('tenant slug', () => {
  it('derives slug from clinic name', () => {
    assert.equal(slugFromClinicName('Smile & Shine Dental'), 'smile-shine-dental');
  });

  it('rejects reserved slugs', () => {
    const r = validateTenantSlug('admin');
    assert.equal(r.ok, false);
  });
});
