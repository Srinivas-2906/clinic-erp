/** Centralized role checks — extend for clinic_admin, doctor, receptionist, etc. */

export const ROLES = {
  OWNER: 'owner',
  STAFF: 'staff',
};

export function canManageDoctors(user) {
  return !!user?.tenantId && user.role === ROLES.OWNER && !user.isPlatformAdmin;
}

export function canManageTeam(user) {
  return canManageDoctors(user);
}

export function canViewDoctors(user) {
  return !!user?.tenantId;
}

export function requireManageDoctors(user) {
  if (!canManageDoctors(user)) {
    const err = new Error('Owner access required');
    err.status = 403;
    throw err;
  }
}

export function requireViewDoctors(user) {
  if (!canViewDoctors(user)) {
    const err = new Error('Tenant access required');
    err.status = 403;
    throw err;
  }
}
