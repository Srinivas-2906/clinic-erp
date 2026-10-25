import { getDb } from '../../db/index.js';

/** User must be linked to an active doctor profile to sign clinical records. */
export function resolveClinicianDoctorId(user, tenantId) {
  if (!user?.sub || !tenantId) return null;
  const row = getDb().prepare(
    `SELECT id FROM doctors WHERE tenant_id = ? AND user_id = ? AND is_active = 1`,
  ).get(tenantId, user.sub);
  return row?.id || null;
}

export function canPerformClinicalActions(user, tenantId) {
  return !!resolveClinicianDoctorId(user, tenantId);
}

export function requireClinician(user, tenantId) {
  if (!canPerformClinicalActions(user, tenantId)) {
    const err = new Error('Clinical access requires your login to be linked to a doctor profile');
    err.status = 403;
    err.code = 'CLINICAL_ACCESS_REQUIRED';
    throw err;
  }
}

/** Anyone with tenant access can read; writes enforced elsewhere. */
export function canViewClinical(user) {
  return !!user?.tenantId && !user.isPlatformAdmin;
}
