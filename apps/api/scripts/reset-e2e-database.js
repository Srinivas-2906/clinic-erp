#!/usr/bin/env node
/** Remove isolated E2E SQLite file so the next API boot gets a fresh demo seed. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.join(__dirname, '../data/e2e/clinic.db');
const dbPath = process.env.DATABASE_PATH || defaultPath;

for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`removed: ${p}`);
    }
  } catch (err) {
    console.warn(`skip ${p}:`, err.message);
  }
}

console.log(JSON.stringify({ reset: true, databasePath: dbPath }));
