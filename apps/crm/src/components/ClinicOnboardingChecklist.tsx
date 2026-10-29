import { useCallback, useEffect, useState } from 'react';
import { X, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { fetchClinicOnboarding, type ClinicOnboardingStatus } from '../lib/api';
import type { TabId } from '../types';

interface Props {
  onGoTab: (tab: TabId) => void;
  onDismiss: () => void;
  refreshKey?: number;
}

const TAB_LABELS: Record<string, string> = {
  settings: 'Settings',
  doctors: 'Doctors',
  team: 'Team',
  patients: 'Patients',
  book: 'Book',
};

export function ClinicOnboardingChecklist({ onGoTab, onDismiss, refreshKey = 0 }: Props) {
  const [status, setStatus] = useState<ClinicOnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchClinicOnboarding();
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load setup checklist');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading && !status) {
    return (
      <div className="pilot-setup-banner" role="region" aria-label="Setup checklist">
        <p className="muted">Loading setup steps…</p>
      </div>
    );
  }

  if (error || !status) return null;
  if (status.allComplete) return null;

  const nextStep = status.steps.find((s) => !s.done);
  const plan = status.plan;

  return (
    <div className="pilot-setup-banner clinic-onboarding-banner" role="region" aria-label="Clinic setup checklist" data-testid="clinic-onboarding-checklist">
      <div className="pilot-setup-head">
        <div>
          <strong>Set up your clinic</strong>
          <p className="signup-hint" style={{ margin: '4px 0 0' }}>
            {status.completed} of {status.total} complete
            {plan?.planLabel && (
              <>
                {' · '}
                <Sparkles size={12} style={{ verticalAlign: 'middle' }} />
                {' '}
                {plan.planLabel}
                {plan.trialEndsAt && plan.subscriptionStatus === 'trialing' && (
                  <> · trial until {new Date(plan.trialEndsAt).toLocaleDateString('en-IN')}</>
                )}
              </>
            )}
          </p>
        </div>
        <button type="button" className="icon-btn" aria-label="Dismiss checklist" onClick={onDismiss}>
          <X size={16} />
        </button>
      </div>
      {nextStep && (
        <p className="clinic-onboarding-next">
          Next: <strong>{nextStep.label}</strong>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onGoTab(nextStep.tab as TabId)}>
            {TAB_LABELS[nextStep.tab] || 'Continue'}
          </button>
        </p>
      )}
      <ul className="pilot-setup-list">
        {status.steps.map((step) => (
          <li key={step.id}>
            {step.done ? <CheckCircle2 size={16} color="var(--success)" /> : <Circle size={16} color="var(--muted)" />}
            <span>{step.label}</span>
            {!step.done && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGoTab(step.tab as TabId)}>
                {TAB_LABELS[step.tab] || 'Open'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
