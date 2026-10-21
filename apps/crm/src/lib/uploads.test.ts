import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_PRESCRIPTION_FILE_BYTES,
  PRESCRIPTION_FILE_TOO_LARGE_MESSAGE,
  assertPrescriptionFileSize,
  uploadPatientPrescription,
} from './uploads';

describe('uploads', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('rejects files over 8 MB before network', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const big = new Blob([new Uint8Array(MAX_PRESCRIPTION_FILE_BYTES + 1)], { type: 'image/jpeg' });
    await expect(uploadPatientPrescription('t', 'k', big)).rejects.toThrow(
      PRESCRIPTION_FILE_TOO_LARGE_MESSAGE,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('assertPrescriptionFileSize allows at-limit file', () => {
    const ok = new Blob([new Uint8Array(MAX_PRESCRIPTION_FILE_BYTES)], { type: 'image/jpeg' });
    expect(() => assertPrescriptionFileSize(ok)).not.toThrow();
  });

  it('maps HTTP 413 to user-facing size message', async () => {
    localStorage.setItem('clinic_token', 'jwt');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: PRESCRIPTION_FILE_TOO_LARGE_MESSAGE }), { status: 413 }),
    );
    const file = new Blob([new Uint8Array(100)], { type: 'image/jpeg' });
    await expect(uploadPatientPrescription('t', 'k', file)).rejects.toThrow(
      PRESCRIPTION_FILE_TOO_LARGE_MESSAGE,
    );
  });
});
