import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClinicFileLoadError,
  loadAuthenticatedClinicFile,
} from './authenticatedClinicFile';

const PROTECTED =
  'https://clinic-api.kaana.in/api/clinic/files/tenant-a/prescription-1.jpg';

describe('loadAuthenticatedClinicFile', () => {
  beforeEach(() => {
    localStorage.setItem('clinic_token', 'test-jwt');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('includes Bearer for protected clinic URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['x'], { type: 'image/jpeg' }), { status: 200 }),
    );

    const { objectUrl } = await loadAuthenticatedClinicFile(PROTECTED);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-jwt');
    expect(String(fetchMock.mock.calls[0][0])).toBe(PROTECTED);
    URL.revokeObjectURL(objectUrl);
  });

  it('never attaches Authorization to external URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      loadAuthenticatedClinicFile('https://example.com/photo.jpg'),
    ).rejects.toBeInstanceOf(ClinicFileLoadError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns blob object URL on 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['abc'], { type: 'image/png' }), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );
    const { blob, objectUrl } = await loadAuthenticatedClinicFile(PROTECTED);
    expect(blob.type).toBe('image/png');
    expect(objectUrl.startsWith('blob:')).toBe(true);
    URL.revokeObjectURL(objectUrl);
  });

  it.each([401, 403, 404] as const)('handles HTTP %i', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }));
    await expect(loadAuthenticatedClinicFile(PROTECTED)).rejects.toMatchObject({
      status,
    });
  });

  it('handles network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(loadAuthenticatedClinicFile(PROTECTED)).rejects.toBeInstanceOf(
      ClinicFileLoadError,
    );
  });
});

describe('upload → store → authenticated GET contract (mocked)', () => {
  it('frontend stores API URL then loads via authenticated GET', async () => {
    const uploadResponseUrl =
      'https://clinic-api.kaana.in/api/clinic/files/tenant-1/prescription-99.jpg';
    localStorage.setItem('clinic_token', 'tok');

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const href = String(input);
        if (href.endsWith('/clinic/uploads') && init?.method === 'POST') {
          return Response.json({ url: uploadResponseUrl }, { status: 201 });
        }
        if (href === uploadResponseUrl) {
          return new Response(new Blob(['img'], { type: 'image/jpeg' }), { status: 200 });
        }
        return new Response(null, { status: 404 });
      });

    const post = await fetch('https://clinic-api.kaana.in/api/clinic/uploads', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'YQ==', contentType: 'image/jpeg' }),
    });
    const { url: storedUrl } = (await post.json()) as { url: string };
    expect(storedUrl).toBe(uploadResponseUrl);

    const { objectUrl } = await loadAuthenticatedClinicFile(storedUrl);
    expect(fetchMock.mock.calls.some((c) => String(c[0]) === uploadResponseUrl)).toBe(true);
    URL.revokeObjectURL(objectUrl);
  });
});
