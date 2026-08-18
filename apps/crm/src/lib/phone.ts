export function normalizePhoneDigits(input: string | null | undefined): string {
  return String(input ?? '').replace(/\D/g, '');
}

// Clinic CRM primarily targets India numbers. We normalize to MSISDN digits (country code + number),
// e.g. "9008747926" → "919008747926", "+919008747926" → "919008747926".
export function normalizeIndiaMsisdn(input: string | null | undefined): string | null {
  const raw = String(input ?? '').trim();
  const digits = normalizePhoneDigits(raw);
  if (!digits) return null;

  // Already E.164-ish with '+' (keep country code as-is)
  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15) return digits;

  // India mobile patterns
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;

  // Best-effort fallback for other stored formats (already includes CC)
  if (digits.length >= 11 && digits.length <= 15) return digits;

  return null;
}

export function toTelUrl(input: string | null | undefined): string | null {
  const msisdn = normalizeIndiaMsisdn(input);
  if (!msisdn) return null;
  return `tel:+${msisdn}`;
}

export function toWhatsAppUrl(input: string | null | undefined, text?: string): string | null {
  const msisdn = normalizeIndiaMsisdn(input);
  if (!msisdn) return null;
  const base = `https://wa.me/${msisdn}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
