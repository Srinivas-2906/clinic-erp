import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getClinicApiOrigins,
  isProtectedClinicFileUrl,
  parseProtectedClinicFileUrl,
  isBrowserPreviewableImageContentType,
} from './clinicFileUrls';

describe('clinic file URL classification', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_CLINIC_API', '/api');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts canonical production clinic file URL', () => {
    const url =
      'https://clinic-api.kaana.in/api/clinic/files/dentacare-uuid/prescription-123.jpg';
    expect(isProtectedClinicFileUrl(url)).toBe(true);
    expect(parseProtectedClinicFileUrl(url)?.fileName).toBe('prescription-123.jpg');
  });

  it('accepts same-origin path on current host', () => {
    const url = `${window.location.origin}/api/clinic/files/tenant-a/photo.png`;
    expect(isProtectedClinicFileUrl(url)).toBe(true);
  });

  it('accepts configured absolute dev API origin', () => {
    vi.stubEnv('VITE_CLINIC_API', 'http://127.0.0.1:3010/api');
    const url = 'http://127.0.0.1:3010/api/clinic/files/tenant-a/x.webp';
    expect(getClinicApiOrigins()).toContain('http://127.0.0.1:3010');
    expect(isProtectedClinicFileUrl(url)).toBe(true);
  });

  it('rejects unrelated external URL', () => {
    expect(
      isProtectedClinicFileUrl('https://storage.googleapis.com/bucket/object.jpg'),
    ).toBe(false);
  });

  it('rejects deceptive hostname', () => {
    expect(
      isProtectedClinicFileUrl(
        'https://clinic-api.kaana.in.attacker.example/api/clinic/files/t/f.jpg',
      ),
    ).toBe(false);
  });

  it('rejects wrong path on allowed origin', () => {
    expect(
      isProtectedClinicFileUrl('https://clinic-api.kaana.in/api/clinic/uploads'),
    ).toBe(false);
  });

  it('rejects path traversal in file segment', () => {
    expect(
      isProtectedClinicFileUrl(
        'https://clinic-api.kaana.in/api/clinic/files/tenant-a/..%2F..%2Fsecret',
      ),
    ).toBe(false);
  });
});

describe('browser preview MIME types', () => {
  it('allows jpeg/png/webp', () => {
    expect(isBrowserPreviewableImageContentType('image/jpeg')).toBe(true);
    expect(isBrowserPreviewableImageContentType('image/png')).toBe(true);
    expect(isBrowserPreviewableImageContentType('image/webp')).toBe(true);
  });

  it('excludes HEIC from in-browser img preview', () => {
    expect(isBrowserPreviewableImageContentType('image/heic')).toBe(false);
    expect(isBrowserPreviewableImageContentType('image/heif')).toBe(false);
  });
});
