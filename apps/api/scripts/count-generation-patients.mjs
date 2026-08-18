import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '../data/recovery/generations');

const counts = new Map();
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.db'))) {
  const db = new Database(path.join(dir, file), { readonly: true });
  counts.set(file, db.prepare('SELECT COUNT(*) AS c FROM patients').get().c);
  db.close();
}
[...counts.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).forEach(([f, c]) => console.log(c, f));
