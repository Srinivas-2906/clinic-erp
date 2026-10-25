import { X, CheckCircle2, Circle } from 'lucide-react';

interface Props {
  canSignClinical: boolean;
  hasDoctors: boolean;
  onGoDoctors: () => void;
  onGoBook: () => void;
  onDismiss: () => void;
}

export function PilotSetupChecklist({
  canSignClinical,
  hasDoctors,
  onGoDoctors,
  onGoBook,
  onDismiss,
}: Props) {
  const steps = [
    {
      id: 'doctors',
      label: 'Add clinic doctors',
      done: hasDoctors,
      action: onGoDoctors,
      actionLabel: 'Doctors',
    },
    {
      id: 'link',
      label: 'Link your login to a doctor profile (required to sign consultations)',
      done: canSignClinical,
      action: onGoDoctors,
      actionLabel: 'Link profile',
    },
    {
      id: 'book',
      label: 'Book your first appointment for today',
      done: false,
      action: onGoBook,
      actionLabel: 'Book',
    },
  ];

  const completeCount = steps.filter((s) => s.done).length;
  if (completeCount >= 2 && canSignClinical) return null;

  return (
    <div className="pilot-setup-banner" role="region" aria-label="Setup checklist">
      <div className="pilot-setup-head">
        <strong>Get ready for the pilot</strong>
        <button type="button" className="icon-btn" aria-label="Dismiss checklist" onClick={onDismiss}>
          <X size={16} />
        </button>
      </div>
      <ul className="pilot-setup-list">
        {steps.map((step) => (
          <li key={step.id}>
            {step.done ? <CheckCircle2 size={16} color="var(--success)" /> : <Circle size={16} color="var(--muted)" />}
            <span>{step.label}</span>
            {!step.done && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={step.action}>
                {step.actionLabel}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
