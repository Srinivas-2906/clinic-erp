import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { getCatalogTemplate } from '../templates/catalogTemplates.js';
import { migrateTenantsToDoctors } from '../modules/providers/doctorMigration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'clinic.db');

let db;

export function initDatabase() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      industry TEXT DEFAULT 'clinic',
      plan TEXT DEFAULT 'growth',
      status TEXT DEFAULT 'active',
      trial_ends_at TEXT,
      settings TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      username TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'owner',
      is_platform_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_username ON users(tenant_id, username);

    CREATE TABLE IF NOT EXISTS catalog_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT DEFAULT '',
      price TEXT DEFAULT '',
      price_num REAL DEFAULT 0,
      meta TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      category TEXT DEFAULT '',
      status TEXT DEFAULT 'Available',
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS patients (
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
      UNIQUE(tenant_id, phone_digits),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      service TEXT DEFAULT '',
      service_id TEXT,
      scheduled_at TEXT NOT NULL,
      duration_min INTEGER DEFAULT 30,
      status TEXT DEFAULT 'requested',
      assigned_doctor TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      source TEXT DEFAULT 'Walk-in',
      reminder_sent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS patient_payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      appointment_id TEXT,
      amount REAL NOT NULL DEFAULT 0,
      method TEXT DEFAULT 'cash',
      reference TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'paid',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      detail TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_patients_tenant ON patients(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_payments_tenant ON patient_payments(tenant_id);

    CREATE TABLE IF NOT EXISTS access_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      requested_at TEXT DEFAULT (datetime('now')),
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_note TEXT DEFAULT '',
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS user_invite_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_access_requests_tenant ON access_requests(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(tenant_id, status);

    CREATE TABLE IF NOT EXISTS doctors (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      specialty TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      qualification TEXT DEFAULT '',
      registration_number TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      user_id TEXT,
      appointment_color TEXT DEFAULT '#2563eb',
      default_slot_duration INTEGER DEFAULT 30,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS doctor_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      slot_duration_minutes INTEGER DEFAULT 30,
      location_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    );

    CREATE TABLE IF NOT EXISTS doctor_time_off (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      start_datetime TEXT NOT NULL,
      end_datetime TEXT NOT NULL,
      reason TEXT DEFAULT '',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS doctor_services (
      tenant_id TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      catalog_item_id TEXT NOT NULL,
      PRIMARY KEY (doctor_id, catalog_item_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id),
      FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id)
    );

    CREATE INDEX IF NOT EXISTS idx_doctors_tenant ON doctors(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_doctors_tenant_active ON doctors(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_doctor_sessions_doctor_dow ON doctor_sessions(doctor_id, day_of_week);
    CREATE INDEX IF NOT EXISTS idx_doctor_time_off_doctor_range ON doctor_time_off(doctor_id, start_datetime, end_datetime);
    CREATE INDEX IF NOT EXISTS idx_doctor_services_catalog ON doctor_services(catalog_item_id);
  `);

  try {
    db.exec(`ALTER TABLE patients ADD COLUMN conversation_id TEXT`);
  } catch {
    /* column exists */
  }

  try {
    db.exec(`ALTER TABLE appointments ADD COLUMN assigned_doctor_id TEXT REFERENCES doctors(id)`);
  } catch {
    /* column exists */
  }

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date ON appointments(tenant_id, assigned_doctor_id, scheduled_at)`);
  } catch {
    /* index exists */
  }

  migrateTenantsToDoctors(db);

  syncDentaCareDemo();
  syncDentaCareCatalog();
  return db;
}

function shouldSeedDemo() {
  if (process.env.SKIP_DEMO_SEED === '1' || process.env.SKIP_DEMO_SEED === 'true') return false;
  if (process.env.NODE_ENV === 'production') return false;
  return true;
}

export function parseSettings(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw ?? {};
  } catch {
    return {};
  }
}

export function tenantToClient(row) {
  const s = parseSettings(row.settings);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    botName: s.botName || 'ClinicBot',
    agentName: s.agentName || 'Reception',
    agentPhone: s.agentPhone || '',
    city: s.city || 'India',
    emoji: s.emoji || '🏥',
    industry: row.industry,
    plan: row.plan,
    status: row.status,
    isLive: row.status === 'active',
  };
}

export function seedCatalogForTenant(tenantId, industry = 'clinic') {
  const existing = db.prepare('SELECT id FROM catalog_items WHERE tenant_id = ? LIMIT 1').get(tenantId);
  if (existing) return;
  upsertCatalogForTenant(tenantId, industry);
}

function upsertCatalogForTenant(tenantId, industry = 'clinic') {
  const items = getCatalogTemplate(industry);
  const existing = db.prepare('SELECT id, title FROM catalog_items WHERE tenant_id = ?').all(tenantId);
  const byTitle = new Map(existing.map((row) => [row.title, row.id]));
  const insert = db.prepare(`
    INSERT INTO catalog_items (id, tenant_id, title, subtitle, price, price_num, meta, image_url, category, status, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', ?)
  `);
  const update = db.prepare(`
    UPDATE catalog_items
    SET subtitle = ?, price = ?, price_num = ?, meta = ?, image_url = ?, category = ?, sort_order = ?, status = 'Available'
    WHERE id = ?
  `);
  items.forEach((item, i) => {
    const id = byTitle.get(item.title);
    if (id) {
      update.run(item.subtitle, item.price, item.priceNum ?? 0, item.meta, item.image, item.category, i, id);
    } else {
      insert.run(
        nanoid(10), tenantId, item.title, item.subtitle, item.price, item.priceNum ?? 0,
        item.meta, item.image, item.category, i,
      );
    }
  });
  const templateTitles = new Set(items.map((item) => item.title));
  for (const row of existing) {
    if (!templateTitles.has(row.title)) {
      db.prepare('DELETE FROM catalog_items WHERE id = ?').run(row.id);
    }
  }
}

function syncDentaCareCatalog() {
  const tenantId = 'denta-care';
  if (!db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId)) return;
  upsertCatalogForTenant(tenantId, 'clinic');
}

export function getCatalogItems(tenantId) {
  return db.prepare('SELECT * FROM catalog_items WHERE tenant_id = ? ORDER BY sort_order ASC').all(tenantId);
}

function syncDentaCareDemo() {
  const tenantId = 'denta-care';
  const hasPatients = (db.prepare('SELECT COUNT(*) AS c FROM patients WHERE tenant_id = ?').get(tenantId)?.c ?? 0) > 0;
  if (hasPatients && !shouldSeedDemo()) return;

  const settings = {
    botName: 'Reception',
    agentName: 'Reception',
    agentPhone: '6301433852',
    city: 'Visakhapatnam',
    emoji: '🦷',
    doctorName: 'Dr. D. Ajit',
    clinicSessions: [
      { start: 10, end: 15, slotMin: 30 },
      { start: 17, end: 22, slotMin: 30 },
    ],
  };
  const tenantSlug = 'dentacare';

  const existing = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId);
  if (!existing) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    db.prepare(`
      INSERT INTO tenants (id, slug, name, industry, plan, status, trial_ends_at, settings)
      VALUES (?, ?, ?, 'clinic', 'growth', 'active', ?, ?)
    `).run(tenantId, tenantSlug, 'Denta Care Dental Clinic', trialEnd.toISOString(), JSON.stringify(settings));
    seedCatalogForTenant(tenantId, 'clinic');
  } else if (shouldSeedDemo()) {
    db.prepare('UPDATE tenants SET slug = ?, name = ?, settings = ? WHERE id = ?').run(
      tenantSlug, 'Denta Care Dental Clinic', JSON.stringify(settings), tenantId,
    );
  }

  const demoAccounts = [
    { id: 'user-dentacare-owner', email: 'ajitdentacare@gmail.com', username: 'Admin', name: 'Dr. D. Ajit', password: 'Dentacare@123' },
    { id: 'user-denta-care-admin', email: 'admin@dentacare.in', username: null, name: 'Dr. D. Ajit', password: 'Dentacare@2024' },
    { id: 'user-denta-care', email: 'demo@dentacare.in', username: null, name: 'Dr. D. Ajit', password: 'demo1234' },
  ];

  for (const acct of demoAccounts) {
    const hash = bcrypt.hashSync(acct.password, 10);
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(acct.email);
    if (!user) {
      db.prepare(`
        INSERT INTO users (id, tenant_id, username, email, password_hash, name, role, is_platform_admin)
        VALUES (?, ?, ?, ?, ?, ?, 'owner', 0)
      `).run(acct.id, tenantId, acct.username || null, acct.email, hash, acct.name);
    } else if (shouldSeedDemo()) {
      db.prepare('UPDATE users SET tenant_id = ?, username = ?, name = ?, password_hash = ? WHERE email = ?').run(
        tenantId, acct.username || null, acct.name, hash, acct.email,
      );
    }
  }

  if (shouldSeedDemo()) seedDentaCareSampleData(tenantId);
}

function seedDentaCareSampleData(tenantId) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare(`
    SELECT COUNT(*) AS c FROM appointments WHERE tenant_id = ? AND date(scheduled_at) = date(?)
  `).get(tenantId, today)?.c ?? 0;
  if (existing >= 2) return;

  const samples = [
    { id: 'pat-demo-1', name: 'Lakshmi Reddy', phone: '9876543210', complaint: 'Tooth pain', service: 'Conservative Dentistry', hour: 10, min: 30, status: 'requested', source: 'WhatsApp' },
    { id: 'pat-demo-2', name: 'Rajesh Kumar', phone: '9876543211', complaint: 'Denture consult', service: 'Complete/Partial Dentures', hour: 11, min: 0, status: 'confirmed', source: 'Walk-in' },
    { id: 'pat-demo-3', name: 'Priya Sharma', phone: '9876543212', complaint: 'Smile makeover', service: 'Cosmetic Dentistry', hour: 17, min: 30, status: 'confirmed', source: 'WhatsApp' },
  ];

  for (const s of samples) {
    const pat = db.prepare('SELECT id FROM patients WHERE id = ?').get(s.id);
    if (!pat) {
      db.prepare(`
        INSERT INTO patients (id, tenant_id, name, phone, phone_digits, chief_complaint, source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        s.id, tenantId, s.name,
        `+91 ${s.phone.slice(0, 5)} ${s.phone.slice(5)}`,
        s.phone, s.complaint, s.source,
      );
    }
    const apptExists = db.prepare('SELECT id FROM appointments WHERE patient_id = ? AND date(scheduled_at) = date(?)').get(s.id, today);
    if (!apptExists) {
      const scheduledAt = `${today}T${String(s.hour).padStart(2, '0')}:${String(s.min).padStart(2, '0')}:00`;
      db.prepare(`
        INSERT OR IGNORE INTO appointments (id, tenant_id, patient_id, service, scheduled_at, status, source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(`appt-${s.id}`, tenantId, s.id, s.service, scheduledAt, s.status, s.source);
    }
  }
}

export function getDb() {
  return db;
}
