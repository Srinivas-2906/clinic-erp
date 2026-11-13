import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useClinicGuide } from '../guides/ClinicGuideContext';

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type Rect = { top: number; left: number; width: number; height: number };

export function ClinicGuideOverlay() {
  const guide = useClinicGuide();
  const step = guide.status === 'active' ? guide.step : null;
  const [rect, setRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const sync = () => {
      const el = document.querySelector(step.target!);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const pad = 6;
      setRect({
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      });
      const reduced = prefersReducedMotion();
      el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      el.classList.add('guide-spotlight-target');
    };
    sync();
    const t = window.setTimeout(sync, 120);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
      const el = document.querySelector(step.target!);
      el?.classList.remove('guide-spotlight-target');
    };
  }, [step]);

  useEffect(() => {
    if (guide.status !== 'active' || !step) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        guide.pauseTour();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guide, step]);

  if (guide.status !== 'active' || !step) return null;

  const progressLabel = `Step ${guide.stepIndex + 1} of ${guide.stepCount}`;
  const allowContinue = step.advance.type === 'explain';
  const showSkipMissing = guide.targetMissing && step.optional;

  return (
    <div className="guide-layer" data-testid="clinic-guide-overlay" aria-live="polite">
      <svg className="guide-backdrop" aria-hidden="true" focusable="false">
        <defs>
          <mask id="guide-spot-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left}
                y={rect.top}
                width={rect.width}
                height={rect.height}
                rx="10"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(8, 15, 30, 0.55)" mask="url(#guide-spot-mask)" />
      </svg>
      {rect && <GuideSpotlightRing rect={rect} />}

      <div
        ref={tooltipRef}
        className="guide-tooltip"
        role="dialog"
        aria-label={step.title}
        style={tooltipStyle(rect)}
        data-testid="clinic-guide-tooltip"
      >
        {guide.demoMode && (
          <p className="guide-demo-badge" role="status">Demonstration mode — nothing is saved automatically</p>
        )}
        <p className="guide-progress">{progressLabel}</p>
        <h3 className="guide-tooltip-title">{step.title}</h3>
        <p className="guide-tooltip-body">{step.body}</p>
        <p className="guide-tooltip-action">
          <strong>Your action:</strong> {step.action}
        </p>
        {guide.targetMissing && !step.optional && (
          <p className="guide-missing" role="status">
            This control isn’t visible right now—use the menu to open the right page, or skip.
          </p>
        )}
        <div className="guide-tooltip-controls">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => guide.backStep()} disabled={guide.stepIndex === 0}>
            Back
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => guide.skipStep()} data-testid="guide-skip-step">
            Skip step
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => guide.exitTour()} data-testid="guide-exit-tour">
            Exit
          </button>
          {showSkipMissing && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => guide.notifyTargetMissingAdvance()}>
              Continue
            </button>
          )}
          {allowContinue && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => guide.skipStep()}
              data-testid="guide-continue-explain"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GuideSpotlightRing({ rect }: { rect: Rect }) {
  return (
    <div
      className="guide-spotlight-ring"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
      aria-hidden
    />
  );
}

function tooltipStyle(_rect: Rect | null): CSSProperties {
  return {
    left: '50%',
    bottom: 88,
    transform: 'translateX(-50%)',
    maxWidth: 420,
    top: 'auto',
  };
}
