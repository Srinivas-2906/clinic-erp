import { useState, useEffect } from 'react';
import { Eye, EyeOff, Info, LogIn, UserPlus, ArrowLeft } from 'lucide-react';
import { isAuthenticated, loginWithCredentials, saveToken, clearToken, getAuthToken, submitAccessRequest } from '../lib/auth';
import { resolveTenantSlug, getTenantLoginDefaults } from '../lib/tenant';

const API_BASE = (() => {
  const api = (import.meta as any).env?.VITE_CLINIC_API as string | undefined
    || (import.meta as any).env?.VITE_WHATSAPP_API as string | undefined
    || '/api';
  return api.replace(/\/api$/, '') || '';
})();

export function LoginGate({ children }: { children: React.ReactNode }) {
  const tenantSlug = resolveTenantSlug();
  const loginDefaults = getTenantLoginDefaults(tenantSlug);
  const [identifier, setIdentifier] = useState(loginDefaults.user);
  const [password, setPassword] = useState(loginDefaults.pass);
  const [error,   setError]   = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [businessName, setBusinessName] = useState('');
  const [mode, setMode] = useState<'login' | 'request'>('login');
  const [requestName, setRequestName] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    if (!tenantSlug) return;
    fetch(`${API_BASE}/api/platform/tenant/${encodeURIComponent(tenantSlug)}/public`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.name) setBusinessName(d.name); })
      .catch(() => {});
  }, [tenantSlug]);

  useEffect(() => {
    async function validate() {
      const token = getAuthToken();
      if (!token) { setChecking(false); return; }
      try {
        const API = import.meta.env.VITE_CLINIC_API || import.meta.env.VITE_WHATSAPP_API || '/api';
        const base = API.replace(/\/api$/, '') || '';
        const res = await fetch(`${base}/api/platform/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Unauthorized');
        const data = await res.json();
        const user = data?.user;
        const tenant = data?.tenant;
        if (tenantSlug) {
          if (user?.isPlatformAdmin) throw new Error('Use client credentials');
          if (!tenant?.slug || tenant.slug !== tenantSlug) throw new Error('Wrong workspace');
        }
      } catch {
        clearToken();
      } finally {
        setChecking(false);
      }
    }
    void validate();
  }, [tenantSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Enter email and password.');
      return;
    }
    setLoading(true); setError('');
    try {
      const token = await loginWithCredentials(identifier, password);
      saveToken(token);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wrong email or password.');
    } finally { setLoading(false); }
  }

  async function handleRequestAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!requestName.trim() || !requestEmail.trim()) {
      setError('Enter your name and Gmail.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await submitAccessRequest(requestEmail.trim(), requestName.trim());
      setRequestSent(true);
      if (result.alreadyPending) {
        setError('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit request.');
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-hero">
            <div className="login-clinic-badge">Clinic Desk</div>
            <h1 className="login-hero-dr-name">Checking session…</h1>
            <p className="login-hero-qual">Please wait</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated()) {
    return (
      <div className="login-screen">
        <div className="login-card">

          {/* Hero */}
          <div className="login-hero">
            <div className="login-clinic-badge">
              Clinic Desk
            </div>
            <h1 className="login-hero-dr-name">
              {businessName || (tenantSlug ? tenantSlug.replace(/-/g, ' ') : 'Front desk')}
            </h1>
            <p className="login-hero-qual">
              Appointments · patients · payments
            </p>
          </div>

          {/* Form */}
          <div className="login-form-area">
            {mode === 'login' ? (
              <>
            {!import.meta.env.PROD && (
            <div className="login-demo-hint">
              <Info size={15} color="var(--brand)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div className="login-demo-hint-text">
                <strong>{loginDefaults.label}</strong>
                {tenantSlug ? (
                  <>
                    Workspace: <code>{tenantSlug}</code>
                    <br />
                    Email: <code>{loginDefaults.user}</code> · password: <code>{loginDefaults.pass}</code>
                  </>
                ) : (
                  <>Username: {loginDefaults.user} · password: {loginDefaults.pass}</>
                )}
              </div>
            </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="login-field">
                <label htmlFor="lUser" className="login-label">Username or email</label>
                <input
                  id="lUser"
                  name="username"
                  type="text"
                  className="login-input"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </div>
              <div className="login-field">
                <label htmlFor="lPass" className="login-label">Password</label>
                <div className="login-password-wrap">
                  <input
                    id="lPass"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    className="login-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && <div className="login-error">{error}</div>}

              <button type="submit" className="login-submit" disabled={loading}>
                {loading
                  ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity=".25"/><path d="M12 3a9 9 0 019 9" strokeLinecap="round"/></svg> Signing in…</>
                  : <><LogIn size={15} /> Sign in</>
                }
              </button>
            </form>

            <button
              type="button"
              className="login-switch-mode"
              onClick={() => { setMode('request'); setError(''); setRequestSent(false); }}
            >
              <UserPlus size={14} /> Need access? Request
            </button>
              </>
            ) : (
              <>
            {requestSent ? (
              <div className="login-request-sent">
                <strong>Request submitted</strong>
                <p>Owner will review <code>{requestEmail}</code>. After approval, you will get a link to set your password.</p>
                <button type="button" className="login-switch-mode" onClick={() => { setMode('login'); setRequestSent(false); }}>
                  <ArrowLeft size={14} /> Back to sign in
                </button>
              </div>
            ) : (
              <>
                <p className="login-request-intro">
                  Enter your Gmail. Owner must approve before you can sign in.
                </p>
                <form onSubmit={handleRequestAccess} noValidate>
                  <div className="login-field">
                    <label htmlFor="reqName" className="login-label">Your name</label>
                    <input
                      id="reqName"
                      type="text"
                      className="login-input"
                      value={requestName}
                      onChange={(e) => setRequestName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>
                  <div className="login-field">
                    <label htmlFor="reqEmail" className="login-label">Gmail address</label>
                    <input
                      id="reqEmail"
                      type="email"
                      className="login-input"
                      value={requestEmail}
                      onChange={(e) => setRequestEmail(e.target.value)}
                      autoComplete="email"
                      autoCapitalize="none"
                      required
                    />
                  </div>
                  {error && <div className="login-error">{error}</div>}
                  <button type="submit" className="login-submit" disabled={loading}>
                    {loading ? 'Submitting…' : <><UserPlus size={15} /> Request access</>}
                  </button>
                </form>
                <button type="button" className="login-switch-mode" onClick={() => { setMode('login'); setError(''); }}>
                  <ArrowLeft size={14} /> Back to sign in
                </button>
              </>
            )}
              </>
            )}
          </div>

        </div>
      </div>
    );
  }

  return <>{children}</>;
}
