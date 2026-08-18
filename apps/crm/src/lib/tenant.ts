export const DENTA_CARE_SLUG = 'dentacare';

const DENTA_CARE_LOGIN = {
  user: 'ajitdentacare@gmail.com',
  pass: 'Dentacare@123',
  label: 'Denta Care — Dr. D. Ajit',
};

export const TENANT_LOGIN_DEFAULTS: Record<string, { user: string; pass: string; label: string }> = {
  [DENTA_CARE_SLUG]: DENTA_CARE_LOGIN,
  'denta-care': DENTA_CARE_LOGIN,
  ajithdentacare: DENTA_CARE_LOGIN,
};

const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'inbox', 'crm', 'clinic', 'admin', 'mail', 'kaana',
]);

const PRODUCT_PREFIXES = new Set(['inbox', 'crm', 'clinic', 'app', 'chat']);

function slugFromHostname(host: string): string | null {
  const parts = host.split('.');
  if (parts.length < 3 || parts[parts.length - 2] !== 'kaana' || parts[parts.length - 1] !== 'in') {
    return null;
  }

  // crm.{tenant}.kaana.in (preferred)
  if (parts.length >= 4 && PRODUCT_PREFIXES.has(parts[0].toLowerCase())) {
    const slug = parts[1];
    if (!slug || RESERVED_SUBDOMAINS.has(slug.toLowerCase())) return null;
    return slug;
  }

  // {tenant}.{product}.kaana.in (legacy)
  if (parts.length >= 4 && PRODUCT_PREFIXES.has(parts[1].toLowerCase())) {
    const slug = parts[0];
    if (!slug || RESERVED_SUBDOMAINS.has(slug.toLowerCase())) return null;
    return slug;
  }

  // {tenant}.kaana.in (tenant marketing site — CRM may still open with ?tenant=)
  if (parts.length === 3) {
    const slug = parts[0];
    if (!slug || RESERVED_SUBDOMAINS.has(slug.toLowerCase())) return null;
    return slug;
  }

  return null;
}

export function getTenantLoginDefaults(slug: string | null) {
  if (slug && TENANT_LOGIN_DEFAULTS[slug]) return TENANT_LOGIN_DEFAULTS[slug];
  return { user: 'Admin', pass: 'Kaana@2024', label: 'Platform admin' };
}

export function resolveTenantSlug(): string | null {
  const params = new URLSearchParams(window.location.search);
  const qp = params.get('tenant') || params.get('workspace');
  if (qp) return qp.trim();

  const env = (import.meta as any).env?.VITE_TENANT_SLUG as string | undefined;
  if (env && typeof env === 'string' && env.trim()) return env.trim();

  const host = window.location.hostname;
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return DENTA_CARE_SLUG;
  }

  return slugFromHostname(host);
}
