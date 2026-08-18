import { nanoid } from 'nanoid';
import { parseSettings } from '../../db/index.js';

const DEFAULT_SESSIONS = [
  { start: 10, end: 15, slotMin: 30 },
  { start: 17, end: 22, slotMin: 30 },
];

/** Mon–Sat (1–6); Sunday closed matches public booking behavior. */
const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6];

function hourToTime(hour) {
  const h = Math.floor(Number(hour) || 0);
  return `${String(h).padStart(2, '0')}:00`;
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function seedSessionsForDoctor(db, tenantId, doctorId, sessions) {
  const list = Array.isArray(sessions) && sessions.length ? sessions : DEFAULT_SESSIONS;
  const insert = db.prepare(`
    INSERT INTO doctor_sessions (id, tenant_id, doctor_id, day_of_week, start_time, end_time, slot_duration_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const dow of DEFAULT_DAYS) {
    for (const session of list) {
      insert.run(
        nanoid(12),
        tenantId,
        doctorId,
        dow,
        hourToTime(session.start ?? 10),
        hourToTime(session.end ?? 15),
        session.slotMin ?? 30,
      );
    }
  }
}

/**
 * Idempotent migration: tenant settings → doctors + sessions; appointments → assigned_doctor_id.
 */
export function migrateTenantsToDoctors(db) {
  const tenants = db.prepare('SELECT id, settings FROM tenants').all();
  let doctorsCreated = 0;
  let appointmentsUpdated = 0;

  for (const tenant of tenants) {
    const settings = parseSettings(tenant.settings);
    const existingDoctors = db.prepare(
      'SELECT id, name, display_name FROM doctors WHERE tenant_id = ? ORDER BY sort_order ASC, created_at ASC',
    ).all(tenant.id);

    let defaultDoctor = existingDoctors[0] ?? null;

    if (!defaultDoctor) {
      const doctorName = String(settings.doctorName || settings.agentName || 'Doctor').trim() || 'Doctor';
      const doctorId = `doc-${tenant.id}-default`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO doctors (
          id, tenant_id, name, display_name, specialty, appointment_color,
          default_slot_duration, is_active, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, '', '#2563eb', 30, 1, 0, ?, ?)
      `).run(doctorId, tenant.id, doctorName, doctorName, now, now);

      const sessions = settings.clinicSessions;
      seedSessionsForDoctor(db, tenant.id, doctorId, sessions);
      defaultDoctor = { id: doctorId, name: doctorName, display_name: doctorName };
      doctorsCreated += 1;
    } else {
      const sessionCount = db.prepare(
        'SELECT COUNT(*) AS c FROM doctor_sessions WHERE doctor_id = ?',
      ).get(defaultDoctor.id)?.c ?? 0;
      if (sessionCount === 0) {
        seedSessionsForDoctor(db, tenant.id, defaultDoctor.id, settings.clinicSessions);
      }
    }

    const doctors = db.prepare(
      'SELECT id, name, display_name FROM doctors WHERE tenant_id = ?',
    ).all(tenant.id);

    const doctorByName = new Map();
    for (const d of doctors) {
      doctorByName.set(normalizeName(d.name), d.id);
      if (d.display_name) doctorByName.set(normalizeName(d.display_name), d.id);
    }

    const appts = db.prepare(`
      SELECT id, assigned_doctor, assigned_doctor_id FROM appointments WHERE tenant_id = ?
    `).all(tenant.id);

    const updateAppt = db.prepare(`
      UPDATE appointments SET assigned_doctor_id = ?, assigned_doctor = ? WHERE id = ?
    `);

    for (const appt of appts) {
      if (appt.assigned_doctor_id) {
        const doc = doctors.find((d) => d.id === appt.assigned_doctor_id);
        if (doc && !appt.assigned_doctor) {
          updateAppt.run(doc.id, doc.display_name || doc.name, appt.id);
          appointmentsUpdated += 1;
        }
        continue;
      }

      let doctorId = defaultDoctor.id;
      const textName = String(appt.assigned_doctor || '').trim();
      if (textName) {
        doctorId = doctorByName.get(normalizeName(textName)) || defaultDoctor.id;
      }

      const doc = doctors.find((d) => d.id === doctorId) || defaultDoctor;
      const displayName = doc.display_name || doc.name;
      updateAppt.run(doctorId, displayName, appt.id);
      appointmentsUpdated += 1;
    }
  }

  if (process.env.NODE_ENV !== 'production' && (doctorsCreated || appointmentsUpdated)) {
    console.log(`[doctor-migration] doctors created: ${doctorsCreated}, appointments updated: ${appointmentsUpdated}`);
  }
}
