import { getDb } from '../db/index.js';

/** Owner operations summary for /clinic/report — derived from existing tables only. */
export function buildOwnerOpsSummary(tenantId, { from, to } = {}) {
  const db = getDb();
  const fromDate = String(from || '').slice(0, 10);
  const toDate = String(to || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const appt = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'visited' THEN 1 ELSE 0 END) AS visited,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS no_show,
      SUM(CASE WHEN status IN ('requested','confirmed','arrived') THEN 1 ELSE 0 END) AS scheduled_open
    FROM appointments
    WHERE tenant_id = ? AND date(scheduled_at) >= date(?) AND date(scheduled_at) <= date(?)
  `).get(tenantId, fromDate, toDate);

  const enc = db.prepare(`
    SELECT COUNT(*) AS finalized
    FROM encounters
    WHERE tenant_id = ? AND status = 'finalized'
      AND date(COALESCE(finalized_at, created_at)) >= date(?)
      AND date(COALESCE(finalized_at, created_at)) <= date(?)
  `).get(tenantId, fromDate, toDate);

  const followUps = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' OR status IS NULL THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled
    FROM follow_ups
    WHERE tenant_id = ?
  `).get(tenantId);

  const doctorLoad = db.prepare(`
    SELECT d.display_name AS doctorName, COUNT(e.id) AS encounterCount
    FROM encounters e
    JOIN doctors d ON d.id = e.doctor_id AND d.tenant_id = e.tenant_id
    WHERE e.tenant_id = ? AND e.status = 'finalized'
      AND date(COALESCE(e.finalized_at, e.created_at)) >= date(?)
      AND date(COALESCE(e.finalized_at, e.created_at)) <= date(?)
    GROUP BY e.doctor_id
    ORDER BY encounterCount DESC
    LIMIT 10
  `).all(tenantId, fromDate, toDate);

  return {
    from: fromDate,
    to: toDate,
    appointments: {
      total: Number(appt?.total) || 0,
      visited: Number(appt?.visited) || 0,
      cancelled: Number(appt?.cancelled) || 0,
      noShow: Number(appt?.no_show) || 0,
      scheduledOpen: Number(appt?.scheduled_open) || 0,
    },
    consultationsFinalized: Number(enc?.finalized) || 0,
    followUps: {
      pending: Number(followUps?.pending) || 0,
      scheduled: Number(followUps?.scheduled) || 0,
    },
    doctorWorkload: doctorLoad.map((r) => ({
      doctorName: r.doctorName,
      encounterCount: Number(r.encounterCount) || 0,
    })),
  };
}
