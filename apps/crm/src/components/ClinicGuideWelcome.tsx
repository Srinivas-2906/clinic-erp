import { useClinicGuide } from '../guides/ClinicGuideContext';
import { chaptersForRole } from '../guides/filterSteps';

type Props = {
  userRole: string;
  userCaps: import('../types').UserCapabilities & Record<string, boolean>;
};

export function ClinicGuideWelcome({ userRole, userCaps }: Props) {
  const guide = useClinicGuide();
  if (!guide.welcomeOpen) return null;

  const chapters = chaptersForRole(userRole, userCaps as Required<import('../types').UserCapabilities>);
  const defaultChapter = chapters[0]?.id;

  return (
    <div className="guide-welcome-overlay" role="dialog" aria-modal="true" aria-labelledby="guide-welcome-title" data-testid="clinic-guide-welcome">
      <div className="guide-welcome-card">
        <h2 id="guide-welcome-title">Welcome to Clinic ERP</h2>
        <p className="guide-welcome-lead">
          Learn the real screens your role uses—spotlights point at live controls, not a generic slideshow.
        </p>
        <label className="guide-demo-toggle">
          <input
            type="checkbox"
            checked={guide.demoMode}
            onChange={(e) => guide.setDemoMode(e.target.checked)}
          />
          <span>Demonstration mode (no patients, appointments, or payments saved)</span>
        </label>
        <div className="guide-welcome-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!defaultChapter}
            onClick={() => defaultChapter && guide.startChapter(defaultChapter, 0)}
            data-testid="guide-start-journey"
          >
            Start guided clinic journey
          </button>
          {guide.canResume && (
            <button type="button" className="btn btn-secondary" onClick={() => guide.resumeJourney()} data-testid="guide-resume-journey">
              Resume unfinished journey
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => guide.dismissWelcomeExplore()} data-testid="guide-explore-own">
            Explore on my own
          </button>
        </div>
      </div>
    </div>
  );
}
