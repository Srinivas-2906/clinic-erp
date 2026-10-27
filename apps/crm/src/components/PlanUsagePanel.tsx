import { useEffect, useState } from 'react';
import { fetchEntitlements, downloadTenantExport } from '../lib/api';
import { getPaymentGatewayConfig } from '../lib/api';

interface Props {
  onToast: (text: string, type?: 'ok' | 'err') => void;
}

export function PlanUsagePanel({ onToast }: Props) {
  const [ent, setEnt] = useState<Awaited<ReturnType<typeof fetchEntitlements>> | null>(null);
  const [gateway, setGateway] = useState<{ configured?: boolean; note?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    Promise.all([fetchEntitlements(), getPaymentGatewayConfig().catch(() => null)])
      .then(([e, g]) => {
        setEnt(e);
        setGateway(g);
      })
      .catch((err) => onToast(err instanceof Error ? err.message : 'Could not load plan', 'err'))
      .finally(() => setLoading(false));
  }, [onToast]);

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

  if (loading) return <p className="section-muted">Loading plan…</p>;
  if (!ent) return null;

  const sub = ent.subscription;
  const atDoctorLimit = ent.limits.maxDoctors != null && ent.usage.doctors >= ent.limits.maxDoctors;
  const atStaffLimit = ent.limits.maxStaff != null && ent.usage.staff >= ent.limits.maxStaff;

  return (
    <div className="plan-usage-panel panel">
      <div className="panel-head">
        <span className="panel-title">Plan & usage</span>
      </div>
      <div className="panel-body">
        <p><strong>{ent.planLabel}</strong> ({ent.planId})</p>
        {sub?.status && <p>Subscription: {sub.status}{sub.canWrite === false ? ' · read-only mode' : ''}</p>}
        {sub?.trialEndsAt && (
          <p>Trial ends: {new Date(sub.trialEndsAt).toLocaleDateString('en-IN')}</p>
        )}
        <p>
          Doctors: {ent.usage.doctors}{ent.limits.maxDoctors != null ? ` / ${ent.limits.maxDoctors}` : ''}
          {atDoctorLimit && <span className="ref"> — limit reached</span>}
        </p>
        <p>
          Staff: {ent.usage.staff}{ent.limits.maxStaff != null ? ` / ${ent.limits.maxStaff}` : ''}
          {atStaffLimit && <span className="ref"> — limit reached</span>}
        </p>
        <p className="muted" style={{ fontSize: '0.875rem' }}>
          {gateway?.configured
            ? 'Online payment gateway is configured.'
            : 'Renewal and online checkout are not available yet — contact support or your account manager to change plans.'}
          {gateway?.note ? ` ${gateway.note}` : ''}
        </p>
        <button type="button" className="btn btn-ghost btn-sm" disabled={exportBusy} onClick={() => void onExport()}>
          {exportBusy ? 'Preparing…' : 'Download clinic data export'}
        </button>
      </div>
    </div>
  );
}
