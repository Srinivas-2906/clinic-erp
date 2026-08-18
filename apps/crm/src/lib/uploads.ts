import { authHeaders } from './auth';

const API = import.meta.env.VITE_CLINIC_API || import.meta.env.VITE_WHATSAPP_API || '/api';

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
  if (!res.ok) throw new Error((json as { error?: string }).error || 'Upload failed');
  const url = (json as { url?: string }).url;
  if (!url) throw new Error('No URL returned from upload');
  return url;
}

/** @deprecated Use uploadPatientPrescription */
export async function uploadPatientPhoto(tenantSlug: string, patientKey: string, file: Blob): Promise<string> {
  return uploadPatientPrescription(tenantSlug, patientKey, file);
}
