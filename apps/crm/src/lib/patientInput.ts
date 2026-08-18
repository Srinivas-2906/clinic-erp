/** Keep only local 10-digit mobile — strips +91 country code when present. */
export function sanitizePhoneDigits(raw: string): string {
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

/** Normalize stored patient phone for edit/booking inputs (local 10 digits only). */
export function localPhoneFromPatient(patient: { phone: string; phoneDigits?: string }): string {
  const raw = patient.phoneDigits || patient.phone;
  return sanitizePhoneDigits(raw);
}

/** Keep only digits for age field. */
export function sanitizeAge(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 3);
}

export function isValidPhone10(phone: string): boolean {
  return sanitizePhoneDigits(phone).length === 10;
}

export function isValidAge(age: string): boolean {
  if (!age.trim()) return false;
  const n = Number(age);
  return Number.isInteger(n) && n >= 1 && n <= 120;
}

export function isValidPatientName(name: string): boolean {
  return name.trim().length >= 2;
}

export function formatPhone10(phone: string): string {
  return sanitizePhoneDigits(phone);
}
