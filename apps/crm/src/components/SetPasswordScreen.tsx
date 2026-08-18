import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { completePasswordSetup, validateInviteToken } from '../lib/auth';

interface Props {
  token: string;
}

export function SetPasswordScreen({ token }: Props) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    validateInviteToken(token)
      .then((data) => {
        setEmail(data.email);
        setName(data.name || '');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Invalid link');
      })
      .finally(() => setChecking(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await completePasswordSetup(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set password');
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
            <h1 className="login-hero-dr-name">Checking link…</h1>
          </div>
        </div>
      </div>
    );
  }

  if (error && !email) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-form-area">
            <div className="login-error">{error}</div>
            <a href="/" className="login-submit" style={{ display: 'inline-flex', textDecoration: 'none', justifyContent: 'center' }}>
              Back to sign in
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-hero">
            <div className="login-clinic-badge">Clinic Desk</div>
            <h1 className="login-hero-dr-name">Password set</h1>
            <p className="login-hero-qual">You can now sign in with {email}</p>
          </div>
          <div className="login-form-area">
            <a href="/" className="login-submit" style={{ display: 'inline-flex', textDecoration: 'none', justifyContent: 'center' }}>
              Sign in
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-hero">
          <div className="login-clinic-badge">Clinic Desk</div>
          <h1 className="login-hero-dr-name">{name || 'Welcome'}</h1>
          <p className="login-hero-qual">Set password for {email}</p>
        </div>

        <div className="login-form-area">
          <form onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="setPass" className="login-label">New password</label>
              <div className="login-password-wrap">
                <input
                  id="setPass"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
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
            <div className="login-field">
              <label htmlFor="setPassConfirm" className="login-label">Confirm password</label>
              <input
                id="setPassConfirm"
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-submit" disabled={loading}>
              {loading
                ? 'Saving…'
                : <><KeyRound size={15} /> Set password</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
