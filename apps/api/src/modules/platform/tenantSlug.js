/** Reserved slugs — product routes, legacy tenant, infrastructure. */
export const RESERVED_TENANT_SLUGS = new Set([
  'www', 'app', 'api', 'admin', 'mail', 'crm', 'clinic', 'inbox', 'kaana', 'staging', 'prod', 'production',
  'dentacare', 'denta-care', 'ajithdentacare', 'platform', 'signup', 'login', 'static', 'health',
]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;

export function normalizeTenantSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export function slugFromClinicName(name) {
  return normalizeTenantSlug(name);
}

export function validateTenantSlug(slug) {
  const s = normalizeTenantSlug(slug);
  if (s.length < 3) return { ok: false, error: 'Workspace URL must be at least 3 characters', slug: s };
  if (s.length > 50) return { ok: false, error: 'Workspace URL is too long', slug: s };
  if (!SLUG_PATTERN.test(s)) {
    return { ok: false, error: 'Use lowercase letters, numbers, and hyphens only', slug: s };
  }
  if (RESERVED_TENANT_SLUGS.has(s)) {
    return { ok: false, error: 'This workspace URL is reserved', slug: s };
  }
  return { ok: true, slug: s };
}
