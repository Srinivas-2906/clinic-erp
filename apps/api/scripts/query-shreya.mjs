import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const clinicReplica = path.join(root, 'data/gcs-restore/clinic-replica');
const outDb = path.join(root, 'data/recovery/clinic-old.db');

function query(dbPath, label) {
  if (!fs.existsSync(dbPath)) {
    console.log(`${label}: missing`);
    return;
  }
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare(`
    SELECT id, name, phone, phone_digits, chief_complaint, source, tags, notes, created_at
    FROM patients
    WHERE name LIKE '%Shreya%' OR phone_digits LIKE '%889883472%'
  `).all();
  console.log(`${label}:`, JSON.stringify(rows, null, 2));
  db.close();
}

if (fs.existsSync(path.join(clinicReplica, 'generations'))) {
  if (fs.existsSync(outDb)) fs.unlinkSync(outDb);
  execSync(
    `wsl bash -c "tr -d '\\r' < /mnt/c/Users/kanas/kaana/kaana-prod/clinic-api/scripts/find-shreya-local.sh | sed 's|kaana-replica|gcs-restore/clinic-replica|' > /tmp/restore-clinic.sh || true"`,
    { stdio: 'ignore' },
  );
}

query(path.join(root, 'data/recovery/kaana.db'), 'kaana.db');
