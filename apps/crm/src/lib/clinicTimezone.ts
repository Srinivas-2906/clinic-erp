/** Clinic wall-clock timezone from tenant settings (default Asia/Kolkata). */
let clinicTimezone = 'Asia/Kolkata';

export function setClinicTimezone(tz: string | undefined | null) {
  const next = String(tz || '').trim();
  if (next) clinicTimezone = next;
}

export function getClinicTimezone(): string {
  return clinicTimezone;
}
