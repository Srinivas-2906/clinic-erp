/** Allowed appointment status transitions (clinic queue). */
const ALLOWED = {
  requested: new Set(['confirmed', 'cancelled', 'no_show']),
  confirmed: new Set(['arrived', 'cancelled', 'no_show']),
  arrived: new Set(['visited', 'cancelled', 'no_show']),
  visited: new Set([]),
  cancelled: new Set([]),
  no_show: new Set([]),
};

export function assertAppointmentStatusTransition(fromStatus, toStatus) {
  const from = String(fromStatus || '').trim();
  const to = String(toStatus || '').trim();
  if (!from || !to || from === to) return;
  const allowed = ALLOWED[from];
  if (!allowed?.has(to)) {
    const err = new Error(`Invalid appointment status change: ${from} → ${to}`);
    err.status = 409;
    throw err;
  }
}
