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

    CREATE TABLE IF NOT EXISTS billing_provider_subscriptions (
      tenant_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'razorpay',
      external_subscription_id TEXT,
      external_plan_id TEXT,
      provider_status TEXT,
      current_period_end TEXT,
      grace_until TEXT,
      canceled_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_billing_provider_sub_ext ON billing_provider_subscriptions(external_subscription_id);

    CREATE TABLE IF NOT EXISTS billing_reconciliation_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      summary_json TEXT
    );

    CREATE TABLE IF NOT EXISTS billing_discrepancies (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      tenant_id TEXT,
      kind TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_billing_disc_run ON billing_discrepancies(run_id);

    CREATE TABLE IF NOT EXISTS billing_notification_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  migrateBillingColumns(db);
}

function migrateBillingColumns(db) {
  const cols = db.prepare(`PRAGMA table_info(billing_transactions)`).all().map((c) => c.name);
  if (!cols.includes('external_subscription_id')) {
    db.exec(`ALTER TABLE billing_transactions ADD COLUMN external_subscription_id TEXT`);
  }
  if (!cols.includes('provider_event_at')) {
    db.exec(`ALTER TABLE billing_transactions ADD COLUMN provider_event_at TEXT`);
  }
}
