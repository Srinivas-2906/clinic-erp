import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '../data/recovery/generations');

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort()) {
  const dbPath = path.join(dir, file);
  const db = new Database(dbPath, { readonly: true });
  const count = db.prepare('SELECT COUNT(*) AS c FROM patients').get().c;
  const shreya = db.prepare(`
    SELECT id, name, phone, phone_digits, chief_complaint, source, tags, created_at
    FROM patients WHERE name LIKE '%Shreya%' OR phone_digits LIKE '%88988%'
  `).all();
  if (count <= 5 || shreya.length) {
    console.log(file, 'patients=', count, shreya.length ? JSON.stringify(shreya) : '');
  }
  db.close();
}
