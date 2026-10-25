/**
 * Removes UNIQUE(tenant_id, phone_digits) so family members can share a contact number.
 * Preserves all patient IDs and row data (rebuild table — SQLite cannot drop table constraints).
 */

const PATIENTS_DDL = `
  CREATE TABLE patients_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    phone_digits TEXT NOT NULL,
    email TEXT DEFAULT '',
    age INTEGER,
    gender TEXT DEFAULT '',
    chief_complaint TEXT DEFAULT '',
    is_returning INTEGER DEFAULT 0,
    tags TEXT DEFAULT '[]',
    notes TEXT DEFAULT '[]',
    last_visit TEXT,
    source TEXT DEFAULT 'Walk-in',
    photo_url TEXT DEFAULT '',
    prescription_url TEXT DEFAULT '',
    record_urls TEXT DEFAULT '[]',
    conversation_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );
`;

const COPY_SQL = `
  INSERT INTO patients_new (
    id, tenant_id, name, phone, phone_digits, email, age, gender, chief_complaint,
    is_returning, tags, notes, last_visit, source, photo_url, prescription_url,
    record_urls, conversation_id, created_at, updated_at
  )
  SELECT
    id, tenant_id, name, phone, phone_digits, email, age, gender, chief_complaint,
    is_returning, tags, notes, last_visit, source, photo_url, prescription_url,
    record_urls, conversation_id, created_at, updated_at
  FROM patients;
`;

function patientsTableHasPhoneUnique(db) {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'patients'`).get();
  const sql = String(row?.sql || '');
  return /UNIQUE\s*\(\s*tenant_id\s*,\s*phone_digits\s*\)/i.test(sql);
}

export function ensurePatientPhoneLookupIndex(db) {
  db.exec('CREATE INDEX IF NOT EXISTS idx_patients_tenant_phone ON patients(tenant_id, phone_digits)');
}

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {{ migrated: boolean; patientCount: number }}
 */
export function migratePatientPhoneNonUnique(db) {
  ensurePatientPhoneLookupIndex(db);

  if (!patientsTableHasPhoneUnique(db)) {
    const count = db.prepare('SELECT COUNT(*) AS c FROM patients').get()?.c ?? 0;
    return { migrated: false, patientCount: count };
  }

  const beforeIds = db.prepare('SELECT id FROM patients ORDER BY id').all().map((r) => r.id);
  const apptRefs = db.prepare(`
    SELECT COUNT(*) AS c FROM appointments a
    WHERE NOT EXISTS (SELECT 1 FROM patients p WHERE p.id = a.patient_id)
  `).get()?.c ?? 0;
  if (apptRefs > 0) {
    throw new Error('Refusing patient migration: orphan appointment patient references');
  }

  db.pragma('foreign_keys = OFF');
  try {
    const run = db.transaction(() => {
      db.exec(PATIENTS_DDL);
      db.exec(COPY_SQL);
      const copied = db.prepare('SELECT COUNT(*) AS c FROM patients_new').get()?.c ?? 0;
      if (copied !== beforeIds.length) {
        throw new Error(`Patient row count mismatch after copy (${copied} vs ${beforeIds.length})`);
      }
      db.exec('DROP TABLE patients');
      db.exec('ALTER TABLE patients_new RENAME TO patients');
      db.exec('CREATE INDEX IF NOT EXISTS idx_patients_tenant ON patients(tenant_id)');
      ensurePatientPhoneLookupIndex(db);
    });
    run();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  const afterIds = db.prepare('SELECT id FROM patients ORDER BY id').all().map((r) => r.id);
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
    throw new Error('Patient IDs changed during phone uniqueness migration');
  }

  const count = afterIds.length;
  return { migrated: true, patientCount: count };
}
