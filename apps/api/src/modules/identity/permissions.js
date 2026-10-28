import {
  ROLES,
  normalizeRole,
  canManageDoctorsPolicy,
  canManageTeamPolicy,
  canViewAuditPolicy,
} from './rolePolicy.js';

export { ROLES, normalizeRole };

export function canManageDoctors(user) {
  return !!user?.tenantId && canManageDoctorsPolicy(user) && !user.isPlatformAdmin;
}

export function canManageTeam(user) {
  return canManageTeamPolicy(user) && !!user?.tenantId && !user.isPlatformAdmin;
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

export function canViewAudit(user) {
  return !!user?.tenantId && canViewAuditPolicy(user) && !user.isPlatformAdmin;
}

export function requireViewAudit(user) {
  if (!canViewAudit(user)) {
    const err = new Error('Owner access required');
    err.status = 403;
    throw err;
  }
}
