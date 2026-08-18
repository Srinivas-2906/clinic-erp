import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const dbPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/recovery/generations/f27d0a4eeeed0d2c.db');
const db = new Database(dbPath, { readonly: true });
const rows = db.prepare(`
  SELECT id, name, phone, tenant_id, created_at FROM patients ORDER BY name
`).all();
console.log('count', rows.length);
rows.forEach((r) => console.log(r.name, r.phone, r.id));
db.close();
