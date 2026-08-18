import type { Appointment, Doctor } from '../types';

export function buildDoctorColorMap(doctors: Doctor[]) {
  const map = new Map<string, string>();
  for (const doc of doctors) {
    map.set(doc.id, doc.appointmentColor || '#2563eb');
  }
  return map;
}

export function doctorDisplayName(doc: Pick<Doctor, 'name' | 'displayName'>) {
  return doc.displayName || doc.name;
}

export function doctorColorFor(
  appt: Pick<Appointment, 'assignedDoctorId'>,
  colorById: Map<string, string>,
  fallback = '#2563eb',
) {
  if (!appt.assignedDoctorId) return fallback;
  return colorById.get(appt.assignedDoctorId) || fallback;
}
