import { useCallback, useEffect, useState } from 'react';
import {
  fetchPlatformTenantDetail,
  fetchPlatformTenants,
  loginPlatformAdmin,
  patchPlatformTenant,
  type PlatformTenantRow,
} from '../lib/platformAdminApi';
import { getAuthToken, logout, saveToken } from '../lib/auth';

export function PlatformAdminApp() {
  const [tokenReady, setTokenReady] = useState(!!getAuthToken());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [tenants, setTenants] = useState<PlatformTenantRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchPlatformTenantDetail>> | null>(null);
  const [confirmNote, setConfirmNote] = useState('');

  const loadList = useCallback(async () => {
    const data = await fetchPlatformTenants({ search: search.trim() || undefined });
    setTenants(data.tenants);
  }, [search]);

  useEffect(() => {
    if (!tokenReady) return;
    void loadList().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [tokenReady, loadList]);

  useEffect(() => {
    if (!tokenReady || !selectedId) {
      setDetail(null);
      return;
    }
    void fetchPlatformTenantDetail(selectedId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : 'Detail failed'));
  }, [tokenReady, selectedId]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const tok = await loginPlatformAdmin(email.trim(), password);
      saveToken(tok);
      setTokenReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function applySubscriptionPatch(field: 'planId' | 'subscriptionStatus', value: string) {
    if (!selectedId || !confirmNote.trim()) {
      setError('Enter a confirmation note before changing subscription or plan.');
      return;
    }
    if (!window.confirm(`Apply ${field}=${value} to this tenant?`)) return;
    setBusy(true);
    try {
      const updated = await patchPlatformTenant(selectedId, {
        confirmNote: confirmNote.trim(),
        [field]: value,
      });
      setDetail(updated as typeof detail);
      await loadList();
      setConfirmNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  if (!tokenReady) {
    return (
      <div className="platform-admin-login">
        <h1>Clinic ERP — Platform</h1>
        <p className="muted">Administrator sign-in only. Clinic staff use the workspace URL.</p>
        <form onSubmit={(e) => void onLogin(e)}>
          <input className="login-input" type="email" placeholder="Platform admin email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="login-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    );
  }

  return (
    <div className="platform-admin">
      <header className="platform-admin-header">
        <h1>Platform administration</h1>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => logout()}>Sign out</button>
      </header>
      <div className="platform-admin-layout">
        <aside className="platform-admin-list">
          <input
            className="login-input"
            placeholder="Search tenants"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void loadList(); }}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadList()}>Search</button>
          <ul>
            {tenants.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`platform-tenant-row${selectedId === t.id ? ' active' : ''}`}
                  onClick={() => setSelectedId(t.id)}
                >
                  <strong>{t.name}</strong>
                  <span>{t.slug} · {t.planLabel || t.plan}</span>
                  <span>{t.subscriptionStatus}{t.canWrite === false ? ' · read-only' : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <main className="platform-admin-detail">
          {!detail ? (
            <p className="muted">Select a tenant</p>
          ) : (
            <>
              <h2>{String(detail.tenant.name)}</h2>
              <p className="muted">{String(detail.tenant.slug)} · {String(detail.tenant.subscriptionStatus)}</p>
              {detail.tenant.trialEndsAt && (
                <p>Trial ends: {new Date(String(detail.tenant.trialEndsAt)).toLocaleDateString()}</p>
              )}
              <section>
                <h3>Usage</h3>
                <p>
                  Doctors {(detail.entitlements as { usage?: { doctors?: number }; limits?: { maxDoctors?: number | null } })?.usage?.doctors ?? '—'} / {(detail.entitlements as { limits?: { maxDoctors?: number | null } })?.limits?.maxDoctors ?? '∞'}
                  {' · '}
                  Staff {(detail.entitlements as { usage?: { staff?: number } })?.usage?.staff ?? '—'} / {(detail.entitlements as { limits?: { maxStaff?: number | null } })?.limits?.maxStaff ?? '∞'}
                </p>
              </section>
              <section>
                <h3>Onboarding</h3>
                <p>{detail.onboarding.completed} / {detail.onboarding.total} checklist steps</p>
                <ul>
                  {detail.onboarding.steps.map((s) => (
                    <li key={s.id}>{s.done ? '✓' : '○'} {s.label}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>Operations</h3>
                <p>Pending reminder jobs: {detail.operations.pendingReminderJobs}</p>
                <p>Failed reminder jobs: {detail.operations.failedReminderJobs}</p>
              </section>
              <section>
                <h3>Admin actions</h3>
                <p className="muted">Changes are audited. Payment renewal is not available until a gateway is configured.</p>
                <label className="form-label">Confirmation note</label>
                <input className="login-input" value={confirmNote} onChange={(e) => setConfirmNote(e.target.value)} placeholder="Reason for change" />
                <div className="platform-admin-actions">
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => applySubscriptionPatch('subscriptionStatus', 'past_due')}>
                    Mark past due
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => applySubscriptionPatch('subscriptionStatus', 'active')}>
                    Mark active
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => applySubscriptionPatch('planId', 'professional')}>
                    Plan: Professional
                  </button>
                </div>
              </section>
            </>
          )}
          {error && <p className="form-error">{error}</p>}
        </main>
      </div>
    </div>
  );
}
