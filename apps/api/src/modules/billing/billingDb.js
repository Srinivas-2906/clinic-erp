/** Subscription billing tables (tenant SaaS — separate from patient_payments ledger). */
export function initBillingSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      from_plan TEXT,
      to_plan TEXT,
      actor_id TEXT,
      source TEXT NOT NULL DEFAULT 'system',
      external_ref TEXT,
      note TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_subscription_events_tenant ON subscription_events(tenant_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS billing_transactions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      plan_id TEXT,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL,
      provider TEXT,
      external_order_id TEXT,
      external_payment_id TEXT,
      idempotency_key TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_tx_idempotency ON billing_transactions(idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_billing_tx_tenant ON billing_transactions(tenant_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS billing_webhook_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      external_event_id TEXT NOT NULL,
      payload_hash TEXT,
      processed_at TEXT NOT NULL DEFAULT (datetime('now')),
      result TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_webhook_dedupe ON billing_webhook_events(provider, external_event_id);
  `);
}
