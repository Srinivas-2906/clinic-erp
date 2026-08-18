import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const patientId = process.argv[2] || 'HvDph49ebtBp';
const dbPath = process.argv[3] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/recovery/pit-latest.db');
const outPath = process.argv[4] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/recovery/clinic-clean.db');

if (!fs.existsSync(dbPath)) {
  console.error('DB not found:', dbPath);
  process.exit(1);
}

fs.copyFileSync(dbPath, outPath);
const db = new Database(outPath);
const before = db.prepare('SELECT id, name, phone, created_at FROM patients WHERE id = ?').get(patientId);
if (!before) {
  console.log('Patient not found:', patientId);
  db.close();
  process.exit(0);
}

const del = db.transaction(() => {
  db.prepare('DELETE FROM patient_payments WHERE patient_id = ?').run(patientId);
  db.prepare('DELETE FROM appointments WHERE patient_id = ?').run(patientId);
  db.prepare('DELETE FROM patients WHERE id = ?').run(patientId);
});

del();
const count = db.prepare('SELECT COUNT(*) AS c FROM patients').get().c;
console.log('Removed:', before);
console.log('Patient count now:', count);
db.close();
