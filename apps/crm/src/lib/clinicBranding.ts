export interface ClinicClient {
  id?: string;
  slug?: string;
  name: string;
  emoji?: string;
  agentName?: string;
  agentPhone?: string;
  city?: string;
  doctorName?: string;
}

export interface ClinicProfile {
  name: string;
  emoji: string;
  slug: string;
  doctorName: string;
  city: string;
  phone: string;
  addressShort: string;
  website: string;
  /** Shown on shared payment receipts — optional per clinic */
  googleReviewUrl?: string;
  tagline: string;
  closingLine: string;
  signOffName: string;
}

/** Branding defaults keyed by tenant slug — aligned with dentacare.kaana.in */
const SLUG_DEFAULTS: Record<string, Partial<ClinicProfile>> = {
  dentacare: {
    doctorName: 'Dr. D. Ajit',
    city: 'Visakhapatnam',
    phone: '6301433852',
    addressShort: 'Shankar Plaza, Muralinagar, Visakhapatnam',
    website: 'https://dentacare.kaana.in',
    googleReviewUrl: 'https://g.page/r/CTSqMDxP1HimEBM/review',
    tagline: 'Compassionate, expert dental care',
    closingLine: 'If you have any questions about your treatment, we are here to help.',
    signOffName: 'Denta Care',
  },
};

export function resolveClinicProfile(client: Partial<ClinicClient> | null | undefined): ClinicProfile {
  const slug = client?.slug || 'dentacare';
  const defaults = SLUG_DEFAULTS[slug] || {};

  return {
    name: client?.name || 'Clinic',
    emoji: client?.emoji || '🏥',
    slug,
    doctorName: client?.doctorName?.trim() || defaults.doctorName || '',
    city: client?.city?.trim() || defaults.city || '',
    phone: (client?.agentPhone?.trim() || defaults.phone || '').replace(/\D/g, '').length >= 10
      ? (client?.agentPhone?.trim() || defaults.phone || '')
      : (defaults.phone || client?.agentPhone?.trim() || ''),
    addressShort: defaults.addressShort || client?.city || '',
    website: defaults.website || '',
    googleReviewUrl: defaults.googleReviewUrl || '',
    tagline: defaults.tagline || 'Thank you for your visit.',
    closingLine: defaults.closingLine || 'If you have any questions, please reach out to us.',
    signOffName: defaults.signOffName || clinicShortName(client?.name || 'Clinic'),
  };
}

export function clinicShortName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || 'Clinic';
}

export function patientFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first || 'there';
}
