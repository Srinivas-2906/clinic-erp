/** Invoice + payment extension schema (additive; preserves legacy patient_payments rows). */

export function initFinanceSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patient_invoices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      appointment_id TEXT,
      encounter_id TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      total REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      notes TEXT DEFAULT '',
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_tenant_patient ON patient_invoices(tenant_id, patient_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status ON patient_invoices(tenant_id, status);

    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      catalog_item_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (invoice_id) REFERENCES patient_invoices(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_line_items(invoice_id);
  `);

  const paymentCols = db.prepare(`PRAGMA table_info(patient_payments)`).all().map((c) => c.name);
  if (!paymentCols.includes('invoice_id')) {
    db.exec(`ALTER TABLE patient_payments ADD COLUMN invoice_id TEXT`);
  }
  if (!paymentCols.includes('kind')) {
    db.exec(`ALTER TABLE patient_payments ADD COLUMN kind TEXT NOT NULL DEFAULT 'payment'`);
  }
  if (!paymentCols.includes('related_payment_id')) {
    db.exec(`ALTER TABLE patient_payments ADD COLUMN related_payment_id TEXT`);
  }
  if (!paymentCols.includes('idempotency_key')) {
    db.exec(`ALTER TABLE patient_payments ADD COLUMN idempotency_key TEXT`);
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency
    ON patient_payments(tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND idempotency_key != ''
  `);
}
