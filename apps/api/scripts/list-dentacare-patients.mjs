import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const dbPath = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/recovery/pit-latest.db');
const db = new Database(dbPath, { readonly: true });
const tenant = db.prepare("SELECT id, slug FROM tenants WHERE slug = 'dentacare'").get();
console.log('tenant', tenant);
const rows = db.prepare('SELECT id, name, phone, created_at FROM patients WHERE tenant_id = ? ORDER BY name').all(tenant.id);
console.log('count', rows.length);
rows.forEach((r) => console.log(r.name, r.phone, r.id, r.created_at));
db.close();
