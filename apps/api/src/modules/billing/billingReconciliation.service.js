import { nanoid } from 'nanoid';
import { getDb } from '../../db/index.js';
import { getPaymentGatewayConfig } from './paymentGateway.js';
import { createRazorpayClient, shouldUseRazorpayMock } from './razorpayClient.js';

/**
 * Compare local billing state with provider (mock or API). Never auto-activates paid entitlements.
 */
export async function runBillingReconciliation({ dryRun = true, limit = 100 } = {}) {
  const db = getDb();
  const runId = nanoid(12);
  const cfg = getPaymentGatewayConfig();
  const discrepancies = [];

  db.prepare(`
    INSERT INTO billing_reconciliation_runs (id, status, summary_json) VALUES (?, 'running', ?)
  `).run(runId, JSON.stringify({ dryRun, mode: cfg.mode }));

  let client = null;
  if (cfg.mode === 'test' || shouldUseRazorpayMock()) {
    try {
      client = createRazorpayClient({
        keyId: process.env.CLINIC_RAZORPAY_KEY_ID,
        keySecret: process.env.CLINIC_RAZORPAY_KEY_SECRET,
        mock: shouldUseRazorpayMock() || cfg.mode === 'test' && !process.env.CLINIC_RAZORPAY_KEY_ID,
      });
    } catch {
      client = createRazorpayClient({ mock: true });
    }
  }

  const rows = db.prepare(`
    SELECT bps.*, t.subscription_status, t.plan
    FROM billing_provider_subscriptions bps
    JOIN tenants t ON t.id = bps.tenant_id
    LIMIT ?
  `).all(Math.min(limit, 500));

  for (const row of rows) {
    if (!row.external_subscription_id || !client) continue;
    let providerSub;
    try {
      providerSub = await client.fetchSubscription(row.external_subscription_id);
    } catch {
      discrepancies.push(recordDiscrepancy(db, runId, row.tenant_id, 'provider_fetch_failed', {
        externalSubscriptionId: row.external_subscription_id,
      }, dryRun));
      continue;
    }
    const localStatus = row.provider_status;
    if (providerSub.status && localStatus && providerSub.status !== localStatus) {
      discrepancies.push(recordDiscrepancy(db, runId, row.tenant_id, 'provider_status_mismatch', {
        local: localStatus,
        provider: providerSub.status,
      }, dryRun));
    }
  }

  const pendingTx = db.prepare(`
    SELECT id, tenant_id, external_order_id, status, created_at
    FROM billing_transactions
    WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-2 days')
    LIMIT ?
  `).all(Math.min(limit, 200));

  for (const tx of pendingTx) {
    discrepancies.push(recordDiscrepancy(db, runId, tx.tenant_id, 'stale_pending_checkout', {
      transactionId: tx.id,
      orderId: tx.external_order_id,
    }, dryRun));
  }

  const summary = {
    dryRun,
    tenantsChecked: rows.length,
    stalePending: pendingTx.length,
    discrepancyCount: discrepancies.filter(Boolean).length,
  };

  db.prepare(`
    UPDATE billing_reconciliation_runs SET status = ?, finished_at = datetime('now'), summary_json = ? WHERE id = ?
  `).run('completed', JSON.stringify(summary), runId);

  return { runId, ...summary, discrepancies: discrepancies.filter(Boolean) };
}

function recordDiscrepancy(db, runId, tenantId, kind, detail, dryRun) {
  const id = nanoid(10);
  if (!dryRun) {
    db.prepare(`
      INSERT INTO billing_discrepancies (id, run_id, tenant_id, kind, detail_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, runId, tenantId, kind, JSON.stringify(detail));
  }
  return { id, tenantId, kind, detail };
}

export function listBillingDiscrepancies({ runId, limit = 50 } = {}) {
  const db = getDb();
  if (runId) {
    return db.prepare(`
      SELECT id, run_id AS runId, tenant_id AS tenantId, kind, detail_json AS detailJson, created_at AS createdAt
      FROM billing_discrepancies WHERE run_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(runId, limit);
  }
  return db.prepare(`
    SELECT id, run_id AS runId, tenant_id AS tenantId, kind, detail_json AS detailJson, created_at AS createdAt
    FROM billing_discrepancies WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT ?
  `).all(limit);
}
