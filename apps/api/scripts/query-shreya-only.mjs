import Database from 'better-sqlite3';
import fs from 'fs';

const dbPath = process.argv[2];
const db = new Database(dbPath, { readonly: true });
const rows = db.prepare(`
  SELECT id, name, phone, phone_digits, chief_complaint, source, tags, created_at
  FROM patients
  WHERE name LIKE '%Shreya%' OR phone_digits LIKE '%88988%'
`).all();
console.log(JSON.stringify(rows, null, 2));
db.close();
