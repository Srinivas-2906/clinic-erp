import { authHeaders } from './auth';

const API = import.meta.env.VITE_CLINIC_API || import.meta.env.VITE_WHATSAPP_API || '/api';

/** Must match clinic-api D2 decoded file cap (8 MiB). */
export const MAX_PRESCRIPTION_FILE_BYTES = 8 * 1024 * 1024;

export const PRESCRIPTION_FILE_TOO_LARGE_MESSAGE =
  'Image is too large. Please choose an image smaller than 8 MB.';

export function assertPrescriptionFileSize(file: Blob): void {
  if (file.size > MAX_PRESCRIPTION_FILE_BYTES) {
    throw new Error(PRESCRIPTION_FILE_TOO_LARGE_MESSAGE);
  }
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') return reject(new Error('Could not read file'));
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/** Upload prescription / record photo via clinic-api (no Firebase). */
export async function uploadPatientPrescription(_tenantSlug: string, _patientKey: string, file: Blob): Promise<string> {
  assertPrescriptionFileSize(file);
  const data = await fileToBase64(file);
  const res = await fetch(`${API}/clinic/uploads`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data,
      contentType: file.type || 'image/jpeg',
      prefix: 'prescription',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 413) {
    throw new Error(
      (json as { error?: string }).error || PRESCRIPTION_FILE_TOO_LARGE_MESSAGE,
    );
  }
  if (!res.ok) throw new Error((json as { error?: string }).error || 'Upload failed');
  const url = (json as { url?: string }).url;
  if (!url) throw new Error('No URL returned from upload');
  return url;
}

/** @deprecated Use uploadPatientPrescription */
export async function uploadPatientPhoto(tenantSlug: string, patientKey: string, file: Blob): Promise<string> {
  return uploadPatientPrescription(tenantSlug, patientKey, file);
}
