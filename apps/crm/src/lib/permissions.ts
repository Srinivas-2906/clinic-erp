import type { UserCapabilities } from '../types';

/** Mirror backend permission helpers for UI gating. */

function effectiveRole(role: string) {
  return role === 'staff' ? 'receptionist' : role;
}

export function capsFromMe(
  role: string,
  capabilities?: UserCapabilities,
  isPlatformAdmin?: boolean,
): Required<UserCapabilities> {
  if (capabilities) {
    return {
      managePatients: !!capabilities.managePatients,
      manageAppointments: !!capabilities.manageAppointments,
      recordPayments: !!capabilities.recordPayments,
      manageFinancials: !!capabilities.manageFinancials,
      manageSettings: !!capabilities.manageSettings,
      viewReports: capabilities.viewReports ?? canViewReports(role, isPlatformAdmin),
    };
  }
  const r = effectiveRole(role);
  const owner = r === 'owner' && !isPlatformAdmin;
  return {
    managePatients: owner || r === 'receptionist' || r === 'doctor',
    manageAppointments: owner || r === 'receptionist' || r === 'doctor',
    recordPayments: owner || r === 'receptionist',
    manageFinancials: owner,
    manageSettings: owner,
    viewReports: canViewReports(role, isPlatformAdmin),
  };
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

export function canViewReports(role: string, isPlatformAdmin?: boolean) {
  if (isPlatformAdmin) return false;
  const r = effectiveRole(role);
  return r === 'owner' || r === 'receptionist';
}
