import type { Appointment, TodayStats } from '../types';
function matchesDoctor(appt: Appointment, doctorId: string) {
  return appt.assignedDoctorId === doctorId;
}

export function filterTodayByDoctor(stats: TodayStats, doctorId?: string | null): TodayStats {
  if (!doctorId) return stats;

  const appointments = stats.appointments.filter((a) => matchesDoctor(a, doctorId));
  const upcomingLater = (stats.upcomingLater ?? stats.pendingRequests ?? []).filter((a) =>
    matchesDoctor(a, doctorId),
  );
  const pendingRequests = upcomingLater.filter((a) => a.status === 'requested');
  const unconfirmedToday = appointments.filter((a) => a.status === 'requested').length;
  const confirmed = appointments.filter((a) => a.status === 'confirmed').length;
  const arrived = appointments.filter((a) => ['arrived', 'visited'].includes(a.status)).length;

  return {
    ...stats,
    appointments,
    upcomingLater,
    pendingRequests,
    total: appointments.length,
    unconfirmedToday,
    unconfirmed: unconfirmedToday + pendingRequests.length,
    confirmed,
    arrived,
  };
}

export function countAppointmentsByDoctor(appointments: Appointment[]) {
  const counts = new Map<string, number>();
  for (const appt of appointments) {
    if (!appt.assignedDoctorId) continue;
    counts.set(appt.assignedDoctorId, (counts.get(appt.assignedDoctorId) ?? 0) + 1);
  }
  return counts;
}

export function dayAppointmentStats(appointments: Appointment[]) {
  const active = appointments.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show');
  return {
    total: active.length,
    unconfirmed: active.filter((a) => a.status === 'requested').length,
    confirmed: active.filter((a) => a.status === 'confirmed').length,
    arrived: active.filter((a) => ['arrived', 'visited'].includes(a.status)).length,
  };
}

export function filterAppointmentsByDoctor(appointments: Appointment[], doctorId?: string | null) {
  if (!doctorId) return appointments;
  return appointments.filter((a) => a.assignedDoctorId === doctorId);
}
