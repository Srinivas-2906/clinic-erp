/** Mirror backend permission helpers for UI gating. */

function effectiveRole(role: string) {
  return role === 'staff' ? 'receptionist' : role;
}

export function canManageDoctors(role: string, isPlatformAdmin?: boolean) {
  return role === 'owner' && !isPlatformAdmin;
}

export function canManageTeam(role: string, isPlatformAdmin?: boolean) {
  return canManageDoctors(role, isPlatformAdmin);
}

export function canManageSettings(role: string, isPlatformAdmin?: boolean) {
  return canManageDoctors(role, isPlatformAdmin);
}

export function canRecordPayments(role: string, isPlatformAdmin?: boolean) {
  if (isPlatformAdmin) return false;
  const r = effectiveRole(role);
  return r === 'owner' || r === 'receptionist';
}

export function canManageFinancials(role: string, isPlatformAdmin?: boolean) {
  return role === 'owner' && !isPlatformAdmin;
}
