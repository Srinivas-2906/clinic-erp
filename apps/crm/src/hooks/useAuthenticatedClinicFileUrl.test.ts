import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthenticatedClinicFileUrl } from './useAuthenticatedClinicFileUrl';

const URL_A =
  'https://clinic-api.kaana.in/api/clinic/files/t/a.jpg';
const URL_B =
  'https://clinic-api.kaana.in/api/clinic/files/t/b.jpg';

describe('useAuthenticatedClinicFileUrl lifecycle', () => {
  beforeEach(() => {
    localStorage.setItem('clinic_token', 'jwt');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('creates and revokes object URL on unmount', async () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-1');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['x'], { type: 'image/jpeg' }), { status: 200 }),
    );

    const { unmount } = renderHook(({ u }) => useAuthenticatedClinicFileUrl(u), {
      initialProps: { u: URL_A },
    });

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
    });

    unmount();
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-1');
  });

  it('ignores stale fetch when URL changes quickly', async () => {
    let resolveA: (v: Response) => void = () => {};
    const slowA = new Promise<Response>((r) => {
      resolveA = r;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const href = String(input);
      if (href === URL_A) return slowA;
      return Promise.resolve(
        new Response(new Blob(['b'], { type: 'image/jpeg' }), { status: 200 }),
      );
    });

    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      void b;
      return `blob:${Math.random()}`;
    });
    vi.spyOn(URL, 'revokeObjectURL');

    const { result, rerender } = renderHook(({ u }) => useAuthenticatedClinicFileUrl(u), {
      initialProps: { u: URL_A },
    });

    rerender({ u: URL_B });
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    resolveA(new Response(new Blob(['stale'], { type: 'image/jpeg' }), { status: 200 }));
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.state.kind).toBe('ready');
  });
});
