import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Loader2 } from 'lucide-react';
import { checkSignupSlugAvailable, submitClinicSignup, type SignupPlanId } from '../lib/api';
import { previewSlugFromName } from '../lib/signupSlug';
import {
  clearSignupDraft,
  clearSignupIdempotencyKey,
  getSignupIdempotencyKey,
  loadSignupDraft,
  saveSignupDraft,
  type SignupDraft,
} from '../lib/signupDraft';

const PLANS: { id: SignupPlanId; label: string; detail: string }[] = [
  { id: 'essential', label: 'Essential', detail: '1 doctor · 2 staff · core desk tools' },
  { id: 'professional', label: 'Professional', detail: 'Up to 10 doctors · audit export · reminders' },
  { id: 'enterprise', label: 'Enterprise', detail: 'Unlimited scale · multi-branch (roadmap)' },
];

const defaultDraft = (): SignupDraft => ({
  step: 0,
  clinicName: '',
  slug: '',
  slugTouched: false,
  planId: 'professional',
  ownerName: '',
  ownerEmail: '',
});

export function SignupWizard() {
  const [draft, setDraft] = useState<SignupDraft>(() => loadSignupDraft() || defaultDraft());
  const [error, setError] = useState('');
  const [slugHint, setSlugHint] = useState('');
  const [slugChecking, setSlugChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [doneUrl, setDoneUrl] = useState<string | null>(null);

  useEffect(() => {
    saveSignupDraft(draft);
  }, [draft]);

  const workspacePreview = useMemo(() => {
    const s = draft.slug || previewSlugFromName(draft.clinicName);
    return s || 'your-clinic';
  }, [draft.slug, draft.clinicName]);

  const setField = useCallback(<K extends keyof SignupDraft>(key: K, value: SignupDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  useEffect(() => {
    if (draft.slugTouched || !draft.clinicName.trim()) return;
    setField('slug', previewSlugFromName(draft.clinicName));
  }, [draft.clinicName, draft.slugTouched, setField]);

  useEffect(() => {
    const slug = draft.slug.trim();
    if (slug.length < 3) {
      setSlugHint('');
      return;
    }
    let cancelled = false;
    setSlugChecking(true);
    const t = window.setTimeout(() => {
      checkSignupSlugAvailable(slug)
        .then((r) => {
          if (cancelled) return;
          setSlugHint(r.available ? 'Workspace URL is available' : (r.error || 'URL is taken'));
        })
        .catch(() => {
          if (!cancelled) setSlugHint('');
        })
        .finally(() => {
          if (!cancelled) setSlugChecking(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [draft.slug]);

  function validateStep(step: number): string | null {
    if (step === 0) {
      if (!draft.clinicName.trim()) return 'Enter your clinic name';
      if ((draft.slug || workspacePreview).length < 3) return 'Choose a workspace URL (3+ characters)';
      if (slugHint && !slugHint.includes('available')) return slugHint || 'Fix workspace URL';
    }
    if (step === 1 && !draft.planId) return 'Select a plan';
    if (step === 2) {
      if (!draft.ownerName.trim()) return 'Enter owner name';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.ownerEmail.trim())) return 'Enter a valid owner email';
    }
    return null;
  }

  function next() {
    const msg = validateStep(draft.step);
    if (msg) {
      setError(msg);
      return;
    }
    setError('');
    setField('step', Math.min(draft.step + 1, 3));
  }

  function back() {
    setError('');
    setField('step', Math.max(draft.step - 1, 0));
  }

  async function submit() {
    const msg = validateStep(2);
    if (msg) {
      setError(msg);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await submitClinicSignup({
        clinicName: draft.clinicName.trim(),
        slug: (draft.slug || workspacePreview).trim(),
        planId: draft.planId,
        ownerName: draft.ownerName.trim(),
        ownerEmail: draft.ownerEmail.trim().toLowerCase(),
        idempotencyKey: getSignupIdempotencyKey(),
      });
      clearSignupDraft();
      clearSignupIdempotencyKey();
      setDoneUrl(result.invite.setPasswordUrl);
      setField('step', 3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (doneUrl && draft.step === 3) {
    return (
      <div className="login-screen">
        <div className="login-card signup-card">
          <div className="login-hero">
            <CheckCircle2 size={36} color="#fff" style={{ marginBottom: 8 }} />
            <h1 className="login-hero-dr-name">Clinic created</h1>
            <p className="login-hero-qual">Set your owner password to open the desk</p>
          </div>
          <div className="login-form-area">
            <p className="signup-success-text">
              Workspace <strong>{workspacePreview}</strong> is ready. Continue to choose a password (link expires in a few days).
            </p>
            <a className="login-submit signup-link-btn" href={doneUrl}>
              Set password & sign in
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card signup-card">
        <div className="login-hero">
          <div className="login-clinic-badge">Clinic ERP</div>
          <h1 className="login-hero-dr-name">Start your clinic workspace</h1>
          <p className="login-hero-qual">Step {draft.step + 1} of 3 · {['Clinic', 'Plan', 'Owner'][draft.step]}</p>
        </div>

        <div className="login-form-area">
          {draft.step === 0 && (
            <>
              <div className="login-field">
                <label className="login-label" htmlFor="clinicName">Clinic name</label>
                <input
                  id="clinicName"
                  className="login-input"
                  value={draft.clinicName}
                  onChange={(e) => setField('clinicName', e.target.value)}
                  placeholder="e.g. Sunrise Dental Care"
                  autoComplete="organization"
                />
              </div>
              <div className="login-field">
                <label className="login-label" htmlFor="slug">Workspace URL</label>
                <div className="signup-slug-row">
                  <Building2 size={16} />
                  <input
                    id="slug"
                    className="login-input"
                    value={draft.slug}
                    onChange={(e) => {
                      setField('slugTouched', true);
                      setField('slug', e.target.value.toLowerCase());
                    }}
                    placeholder={workspacePreview}
                    autoComplete="off"
                  />
                </div>
                <p className={`signup-hint${slugHint.includes('available') ? ' ok' : slugHint ? ' err' : ''}`}>
                  {slugChecking ? 'Checking availability…' : slugHint || `Desk link: ?tenant=${workspacePreview}`}
                </p>
              </div>
            </>
          )}

          {draft.step === 1 && (
            <div className="signup-plan-grid">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`signup-plan${draft.planId === p.id ? ' selected' : ''}`}
                  onClick={() => setField('planId', p.id)}
                >
                  <strong>{p.label}</strong>
                  <span>{p.detail}</span>
                </button>
              ))}
              <p className="signup-hint">Billing is not charged in this release — plan sets desk limits only.</p>
            </div>
          )}

          {draft.step === 2 && (
            <>
              <div className="login-field">
                <label className="login-label" htmlFor="ownerName">Owner name</label>
                <input
                  id="ownerName"
                  className="login-input"
                  value={draft.ownerName}
                  onChange={(e) => setField('ownerName', e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="login-field">
                <label className="login-label" htmlFor="ownerEmail">Owner email</label>
                <input
                  id="ownerEmail"
                  type="email"
                  className="login-input"
                  value={draft.ownerEmail}
                  onChange={(e) => setField('ownerEmail', e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="signup-review">
                <div><span>Clinic</span><strong>{draft.clinicName}</strong></div>
                <div><span>URL</span><strong>{workspacePreview}</strong></div>
                <div><span>Plan</span><strong>{draft.planId}</strong></div>
              </div>
            </>
          )}

          {error && <div className="login-error">{error}</div>}

          <div className="signup-nav">
            {draft.step > 0 && (
              <button type="button" className="signup-back" onClick={back}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {draft.step < 2 ? (
              <button type="button" className="login-submit" onClick={next}>
                Continue <ArrowRight size={14} />
              </button>
            ) : (
              <button type="button" className="login-submit" disabled={submitting} onClick={() => void submit()}>
                {submitting ? <><Loader2 size={14} className="spin" /> Creating…</> : 'Create clinic workspace'}
              </button>
            )}
          </div>

          <a className="login-switch-mode" href="/?tenant=dentacare">Already have a workspace? Sign in</a>
        </div>
      </div>
    </div>
  );
}
