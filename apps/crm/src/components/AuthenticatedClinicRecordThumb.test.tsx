import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedClinicRecordThumb } from './AuthenticatedClinicRecordThumb';

const PROTECTED =
  'https://clinic-api.kaana.in/api/clinic/files/tenant-a/r.jpg';

describe('AuthenticatedClinicRecordThumb', () => {
  beforeEach(() => {
    localStorage.setItem('clinic_token', 'jwt');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders protected image via blob URL without raw API href', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['x'], { type: 'image/jpeg' }), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    );

    render(<AuthenticatedClinicRecordThumb url={PROTECTED} alt="Record 1" />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Record 1' })).toHaveAttribute(
        'src',
        expect.stringMatching(/^blob:/),
      );
    });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not send Authorization to external URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(
      <AuthenticatedClinicRecordThumb
        url="https://cdn.example.com/photo.jpg"
        alt="External"
      />,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://cdn.example.com/photo.jpg');
  });
});
