import Database from 'better-sqlite3';
import fs from 'fs';

const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.error('Usage: node scripts/query-db.mjs <path-to.db>');
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const count = db.prepare('SELECT COUNT(*) AS c FROM patients').get();
console.log('patient count:', count.c);
const rows = db.prepare(`
  SELECT id, name, phone, phone_digits, chief_complaint, source, tags, is_returning, last_visit, created_at
  FROM patients
  ORDER BY created_at
`).all();
console.log(JSON.stringify(rows, null, 2));
db.close();
