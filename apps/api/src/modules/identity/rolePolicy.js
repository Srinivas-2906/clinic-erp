/**
 * Clinic desk roles — backward compatible with legacy `staff` (= receptionist).
 */

export const ROLES = {
  OWNER: 'owner',
  RECEPTIONIST: 'receptionist',
  DOCTOR: 'doctor',
  /** @deprecated assign receptionist on new users; kept for existing rows */
  STAFF: 'staff',
};

const ASSIGNABLE_ROLES = [ROLES.RECEPTIONIST, ROLES.DOCTOR];

export function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === ROLES.STAFF) return ROLES.RECEPTIONIST;
  if (r === ROLES.OWNER || r === ROLES.RECEPTIONIST || r === ROLES.DOCTOR) return r;
  if (r) return r;
  return ROLES.RECEPTIONIST;
}

export function isAssignableStaffRole(role) {
  const n = normalizeRole(role);
  return ASSIGNABLE_ROLES.includes(n);
}

export function effectiveRole(user) {
  if (!user?.tenantId || user.isPlatformAdmin) return null;
  return normalizeRole(user.role);
}

function isOwner(user) {
  return effectiveRole(user) === ROLES.OWNER;
}

export function canManageClinicSettings(user) {
  return isOwner(user);
}

export function canManageDoctorsPolicy(user) {
  return isOwner(user);
}

export function canManageTeamPolicy(user) {
  return isOwner(user);
}

export function canViewAuditPolicy(user) {
  return isOwner(user);
}

/** Front desk: patients, appointments, record payments/invoices (not refunds). */
export function canUseFrontDesk(user) {
  const r = effectiveRole(user);
  return r === ROLES.OWNER || r === ROLES.RECEPTIONIST || r === ROLES.DOCTOR;
}

export function canManagePatients(user) {
  return canUseFrontDesk(user);
}

export function canManageAppointments(user) {
  return canUseFrontDesk(user);
}

export function canRecordPayments(user) {
  const r = effectiveRole(user);
  return r === ROLES.OWNER || r === ROLES.RECEPTIONIST;
}

export function canManageFinancials(user) {
  return isOwner(user);
}

/** Open consult / create draft — desk or clinician; finalize still requires clinician link. */
export function canStartConsultation(user) {
  return canUseFrontDesk(user);
}

export function requireCapability(checkFn, message = 'Forbidden') {
  return (user) => {
    if (!checkFn(user)) {
      const err = new Error(message);
      err.status = 403;
      throw err;
    }
  };
}

export function assertCapability(user, checkFn, message = 'Forbidden') {
  requireCapability(checkFn, message)(user);
}
