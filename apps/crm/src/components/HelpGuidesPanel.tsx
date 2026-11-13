import { BookOpen, ListChecks, X } from 'lucide-react';
import { useClinicGuide } from '../guides/ClinicGuideContext';
import { clearPilotSetupDismissed } from '../lib/pilotSetupStorage';
import type { GuideChapterId } from '../guides/types';

type Props = {
  tenantSlug: string;
  onRestoreChecklist: () => void;
};

export function HelpGuidesPanel({ tenantSlug, onRestoreChecklist }: Props) {
  const guide = useClinicGuide();
  if (!guide.pickerOpen) return null;

  return (
    <div className="guide-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="guide-picker-title" data-testid="clinic-guide-picker">
      <div className="guide-picker-card">
        <div className="guide-picker-head">
          <h2 id="guide-picker-title">
            <BookOpen size={18} /> Help &amp; guides
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => guide.closePicker()}>
            <X size={16} />
          </button>
        </div>
        <p className="guide-picker-hint">Every chapter can be restarted. Progress is saved per user, role, and clinic.</p>
        {guide.canResume && (
          <button type="button" className="btn btn-primary btn-sm guide-picker-resume" onClick={() => guide.resumeJourney()}>
            Resume unfinished journey
          </button>
        )}
        <ul className="guide-picker-list">
          {guide.chapters.map((ch) => {
            const chapterId = ch.id as GuideChapterId;
            return (
              <li key={ch.id}>
                <div>
                  <strong>{ch.title}</strong>
                  <p className="muted">{ch.subtitle}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  data-testid={`guide-start-${chapterId}`}
                  onClick={() => guide.startChapter(chapterId, 0)}
                >
                  Start
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => guide.restartChapter(chapterId)}>
                  Restart
                </button>
              </li>
            );
          })}
        </ul>
        <div className="guide-picker-footer">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              clearPilotSetupDismissed(tenantSlug);
              onRestoreChecklist();
              guide.closePicker();
            }}
          >
            <ListChecks size={14} /> Show owner setup checklist again
          </button>
        </div>
      </div>
    </div>
  );
}
