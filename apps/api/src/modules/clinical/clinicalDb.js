/** Clinical schema (SQLite today; PostgreSQL-compatible DDL). */

export function initClinicalSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS encounters (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      appointment_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      chief_complaint TEXT DEFAULT '',
      history_summary TEXT DEFAULT '',
      clinical_note TEXT DEFAULT '',
      dental_chart_json TEXT DEFAULT '',
      created_by TEXT NOT NULL,
      finalized_by TEXT,
      finalized_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id),
      FOREIGN KEY (appointment_id) REFERENCES appointments(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS encounter_vitals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      encounter_id TEXT NOT NULL,
      code TEXT NOT NULL,
      value TEXT NOT NULL,
      unit TEXT DEFAULT '',
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS encounter_diagnoses (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      encounter_id TEXT NOT NULL,
      description TEXT NOT NULL,
      code TEXT DEFAULT '',
      is_primary INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      encounter_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      pdf_storage_key TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prescription_items (
      id TEXT PRIMARY KEY,
      prescription_id TEXT NOT NULL,
      drug_name TEXT NOT NULL,
      dose TEXT DEFAULT '',
      frequency TEXT DEFAULT '',
      duration TEXT DEFAULT '',
      instructions TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS patient_allergies (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      substance TEXT NOT NULL,
      severity TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS follow_ups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      encounter_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      due_date TEXT NOT NULL,
      instructions TEXT DEFAULT '',
      reminder_job_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (encounter_id) REFERENCES encounters(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS clinical_attachments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      encounter_id TEXT,
      storage_key TEXT NOT NULL,
      content_type TEXT DEFAULT '',
      kind TEXT DEFAULT 'clinical',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (encounter_id) REFERENCES encounters(id)
    );

    CREATE TABLE IF NOT EXISTS record_amendments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL,
      author_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_encounters_tenant_patient ON encounters(tenant_id, patient_id);
    CREATE INDEX IF NOT EXISTS idx_encounters_appointment ON encounters(appointment_id);
    CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient ON patient_allergies(tenant_id, patient_id);
  `);

  try {
    db.exec(`ALTER TABLE appointments ADD COLUMN encounter_id TEXT REFERENCES encounters(id)`);
  } catch {
    /* exists */
  }
  try {
    db.exec(`ALTER TABLE reminder_jobs ADD COLUMN follow_up_id TEXT`);
  } catch {
    /* exists */
  }
}
