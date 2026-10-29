const CLINIC_TZ = 'Asia/Kolkata';

/** Clinic-local calendar date (YYYY-MM-DD). */
export function clinicTodayYmd(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
}

export function formatApptTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: CLINIC_TZ,
  });
}
