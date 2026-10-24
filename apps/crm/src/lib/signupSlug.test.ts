import { describe, it, expect } from 'vitest';
import { previewSlugFromName } from './signupSlug';

describe('previewSlugFromName', () => {
  it('normalizes clinic name', () => {
    expect(previewSlugFromName('City Dental Care')).toBe('city-dental-care');
  });
});
