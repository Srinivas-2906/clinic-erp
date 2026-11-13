import { resolveTenantSlug } from './tenant';

/** Per-tenant key so dismissing setup on one clinic does not hide checklist elsewhere. */
export function pilotSetupDismissedKey(tenantSlug?: string | null) {
  const slug = (tenantSlug || resolveTenantSlug() || 'default').trim().toLowerCase();
  return `pilot-setup-dismissed:${slug}`;
}

export function readPilotSetupDismissed(tenantSlug?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const scoped = localStorage.getItem(pilotSetupDismissedKey(tenantSlug));
  if (scoped === '1') return true;
  // Legacy global flag — migrate on read
  if (localStorage.getItem('pilot-setup-dismissed') === '1') return true;
  return false;
}

export function writePilotSetupDismissed(tenantSlug?: string | null) {
  localStorage.setItem(pilotSetupDismissedKey(tenantSlug), '1');
}

export function clearPilotSetupDismissed(tenantSlug?: string | null) {
  localStorage.removeItem(pilotSetupDismissedKey(tenantSlug));
  localStorage.removeItem('pilot-setup-dismissed');
}
