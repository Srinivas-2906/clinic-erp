/** Mirror backend permission helpers for UI gating. */

export function canManageDoctors(role: string, isPlatformAdmin?: boolean) {
  return role === 'owner' && !isPlatformAdmin;
}

export function canManageTeam(role: string, isPlatformAdmin?: boolean) {
  return canManageDoctors(role, isPlatformAdmin);
}
