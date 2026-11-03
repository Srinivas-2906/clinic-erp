import { useCallback, useEffect, useState } from 'react';
import {
  cancelSubscription,
  createBillingCheckout,
  fetchBillingPlans,
  fetchBillingTransactions,
  fetchEntitlements,
  fetchSubscriptionEvents,
  fetchBillingDiagnostics,
  downloadTenantExport,
  getPaymentGatewayConfig,
} from '../lib/api';

interface Props {
  onToast: (text: string, type?: 'ok' | 'err') => void;
}

function formatInr(cents: number) {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

function trialDaysLeft(iso?: string | null) {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function PlanUsagePanel({ onToast }: Props) {
  const [ent, setEnt] = useState<Awaited<ReturnType<typeof fetchEntitlements>> | null>(null);
  const [gateway, setGateway] = useState<Awaited<ReturnType<typeof getPaymentGatewayConfig>> | null>(null);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof fetchBillingPlans>>['plans']>([]);
  const [transactions, setTransactions] = useState<Awaited<ReturnType<typeof fetchBillingTransactions>>['transactions']>([]);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof fetchSubscriptionEvents>>['events']>([]);
  const [diagnostics, setDiagnostics] = useState<Awaited<ReturnType<typeof fetchBillingDiagnostics>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const reload = useCallback(async () => {
    const [e, g, planPack, tx, ev, diag] = await Promise.all([
      fetchEntitlements(),
      getPaymentGatewayConfig().catch(() => null),
      fetchBillingPlans().catch(() => ({ plans: [], gateway: null })),
      fetchBillingTransactions().catch(() => ({ transactions: [] })),
      fetchSubscriptionEvents().catch(() => ({ events: [] })),
      fetchBillingDiagnostics().catch(() => null),
    ]);
    setEnt(e);
    setGateway(g);
    setPlans(planPack.plans);
    setTransactions(tx.transactions);
    setEvents(ev.events);
    setDiagnostics(diag);
  }, []);

  useEffect(() => {
    reload()
      .catch((err) => onToast(err instanceof Error ? err.message : 'Could not load plan', 'err'))
      .finally(() => setLoading(false));
  }, [onToast, reload]);

  async function onExport() {
    setExportBusy(true);
    try {
      await downloadTenantExport();
      onToast('Export downloaded', 'ok');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Export failed', 'err');
    } finally {
      setExportBusy(false);
    }
  }

  async function onCheckout(planId: string) {
    if (!gateway?.checkoutEnabled) return;
    setCheckoutBusy(planId);
    try {
      const checkout = await createBillingCheckout({ planId, idempotencyKey: `ui-${planId}-${Date.now()}` });
      onToast(
        checkout.message
          || `Sandbox order ${checkout.orderId} created — activation requires verified payment webhook.`,
        'ok',
      );
      await reload();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Checkout failed', 'err');
    } finally {
      setCheckoutBusy(null);
    }
  }

  async function onCancel() {
    if (!window.confirm('Cancel subscription? Your clinic may become read-only when the current period ends.')) return;
    setCancelBusy(true);
    try {
      await cancelSubscription('Owner requested cancellation');
      onToast('Subscription marked canceled', 'ok');
      await reload();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Cancel failed', 'err');
    } finally {
      setCancelBusy(false);
    }
  }

  if (loading) return <p className="section-muted">Loading plan…</p>;
  if (!ent) return null;

  const sub = ent.subscription;
  const trialLeft = trialDaysLeft(sub?.trialEndsAt);
  const atDoctorLimit = ent.limits.maxDoctors != null && ent.usage.doctors >= ent.limits.maxDoctors;
  const atStaffLimit = ent.limits.maxStaff != null && ent.usage.staff >= ent.limits.maxStaff;
  const canCheckout = !!gateway?.checkoutEnabled;
  const status = sub?.status || ent.subscriptionStatus || 'unknown';
  const isCanceled = status === 'canceled';

  return (
    <div className="plan-usage-panel panel">
      <div className="panel-head">
        <span className="panel-title">Plan & subscription</span>
      </div>
      <div className="panel-body">
        <p><strong>{ent.planLabel}</strong> ({ent.planId})</p>
        <p>
          Status: {status}
          {sub?.canWrite === false ? ' · read-only mode' : ''}
        </p>
        {sub?.trialEndsAt && (
          <p>
            Trial ends: {new Date(sub.trialEndsAt).toLocaleDateString('en-IN')}
            {trialLeft != null ? ` · ${trialLeft} day${trialLeft === 1 ? '' : 's'} left` : ''}
          </p>
        )}
        {status === 'past_due' && (
          <p className="form-error" style={{ fontSize: '0.875rem' }}>
            Last subscription payment failed. Complete checkout or contact support to restore write access.
          </p>
        )}
        {diagnostics?.recoveryHint && (
          <p className="plan-recovery-hint" role="status">{diagnostics.recoveryHint}</p>
        )}
        {diagnostics?.renewalAt && (
          <p className="muted" style={{ fontSize: '0.875rem' }}>
            Next renewal period end: {new Date(diagnostics.renewalAt).toLocaleDateString('en-IN')}
            {diagnostics.provider?.providerStatus ? ` · Provider: ${diagnostics.provider.providerStatus}` : ''}
          </p>
        )}
        {diagnostics?.openDiscrepancies?.length ? (
          <p className="muted" style={{ fontSize: '0.875rem' }}>
            Billing review pending ({diagnostics.openDiscrepancies.length}) — support may contact you. No action bypasses server verification.
          </p>
        ) : null}
        <p>
          Doctors: {ent.usage.doctors}{ent.limits.maxDoctors != null ? ` / ${ent.limits.maxDoctors}` : ''}
          {atDoctorLimit && <span className="ref"> — limit reached</span>}
        </p>
        <p>
          Staff: {ent.usage.staff}{ent.limits.maxStaff != null ? ` / ${ent.limits.maxStaff}` : ''}
          {atStaffLimit && <span className="ref"> — limit reached</span>}
        </p>

        {plans.length > 0 && (
          <section className="plan-billing-section">
            <h4 className="plan-section-title">Available plans</h4>
            <ul className="plan-offer-list">
              {plans.map((p) => (
                <li key={p.id} className="plan-offer-row">
                  <div>
                    <strong>{p.label}</strong>
                    {p.amountCentsInr != null && (
                      <span className="muted"> · {formatInr(p.amountCentsInr)}/period (sandbox)</span>
                    )}
                  </div>
                  {canCheckout && p.id !== ent.planId && !isCanceled && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={!!checkoutBusy}
                      onClick={() => void onCheckout(p.id)}
                    >
                      {checkoutBusy === p.id ? 'Creating…' : 'Upgrade / change'}
                    </button>
                  )}
                  {p.id === ent.planId && <span className="muted">Current plan</span>}
                </li>
              ))}
            </ul>
            {!canCheckout && (
              <p className="muted" style={{ fontSize: '0.875rem' }}>
                Online checkout is not enabled — contact support to change plans.
                {gateway?.note ? ` ${gateway.note}` : ''}
              </p>
            )}
            {canCheckout && gateway?.mode === 'sandbox' && (
              <p className="muted" style={{ fontSize: '0.875rem' }}>
                Sandbox billing — no live charges. Paid entitlements activate only after verified webhooks.
              </p>
            )}
          </section>
        )}

        {transactions.length > 0 && (
          <section className="plan-billing-section">
            <h4 className="plan-section-title">Payment history</h4>
            <ul className="plan-tx-list">
              {transactions.slice(0, 8).map((t) => (
                <li key={t.id}>
                  {new Date(t.createdAt).toLocaleDateString('en-IN')} · {t.planId} · {t.status}
                  {t.amountCents ? ` · ${formatInr(t.amountCents)}` : ''}
                  {t.failureReason ? ` — ${t.failureReason}` : ''}
                </li>
              ))}
            </ul>
          </section>
        )}

        {events.length > 0 && (
          <section className="plan-billing-section">
            <h4 className="plan-section-title">Subscription activity</h4>
            <ul className="plan-tx-list">
              {events.slice(0, 6).map((ev) => (
                <li key={ev.id}>
                  {new Date(ev.createdAt).toLocaleDateString('en-IN')} · {ev.eventType}
                  {ev.toPlan ? ` → ${ev.toPlan}` : ''}
                  {ev.toStatus ? ` (${ev.toStatus})` : ''}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isCanceled && status !== 'canceled' && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={cancelBusy}
            onClick={() => void onCancel()}
          >
            {cancelBusy ? 'Canceling…' : 'Cancel subscription'}
          </button>
        )}

        <button type="button" className="btn btn-ghost btn-sm" disabled={exportBusy} onClick={() => void onExport()}>
          {exportBusy ? 'Preparing…' : 'Download clinic data export'}
        </button>
      </div>
    </div>
  );
}
