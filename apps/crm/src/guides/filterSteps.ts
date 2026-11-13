import { GUIDE_CHAPTERS, GUIDE_STEPS } from './chapters';
import type { ClinicGuideRole, GuideChapterId, GuideStep } from './types';
import type { UserCapabilities } from '../types';

function effectiveRole(role: string): ClinicGuideRole | null {
  const r = role === 'staff' ? 'receptionist' : role;
  if (r === 'owner' || r === 'receptionist' || r === 'doctor') return r;
  return null;
}

export function normalizeGuideRole(role: string): ClinicGuideRole {
  return effectiveRole(role) ?? 'receptionist';
}

export function chaptersForRole(role: string, caps: Required<UserCapabilities>) {
  const r = effectiveRole(role);
  if (!r) return [];
  return GUIDE_CHAPTERS.filter((ch) => {
    if (!ch.roles.includes(r)) return false;
    return stepsForChapter(ch.id, role, caps).length > 0;
  });
}

export function stepsForChapter(
  chapterId: GuideChapterId,
  role: string,
  caps: Required<UserCapabilities>,
): GuideStep[] {
  const r = effectiveRole(role);
  if (!r) return [];
  return GUIDE_STEPS.filter((step) => {
    if (step.chapterId !== chapterId) return false;
    if (!step.roles.includes(r)) return false;
    if (step.requiresCap && !caps[step.requiresCap]) return false;
    return true;
  });
}

export function allStepsForRole(role: string, caps: Required<UserCapabilities>) {
  const r = effectiveRole(role);
  if (!r) return [];
  return GUIDE_STEPS.filter((step) => {
    if (!step.roles.includes(r)) return false;
    if (step.requiresCap && !caps[step.requiresCap]) return false;
    return true;
  });
}
