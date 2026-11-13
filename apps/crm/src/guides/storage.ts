import { CLINIC_GUIDE_VERSION, GUIDE_STORAGE_PREFIX } from './constants';
import type { ClinicGuideRole, GuideChapterId, GuidePersistence } from './types';

export type GuideIdentity = {
  tenantSlug: string;
  userId: string;
  role: ClinicGuideRole;
};

export function guideStorageKey(identity: GuideIdentity): string {
  const tenant = identity.tenantSlug.trim().toLowerCase() || 'default';
  const user = identity.userId.trim() || 'anon';
  const role = identity.role;
  return `${GUIDE_STORAGE_PREFIX}:v${CLINIC_GUIDE_VERSION}:${tenant}:${user}:${role}`;
}

export function emptyGuideState(): GuidePersistence {
  return {
    version: CLINIC_GUIDE_VERSION,
    demoMode: true,
    welcomed: false,
    exploreOwn: false,
    activeChapterId: null,
    chapters: {},
  };
}

export function loadGuideState(identity: GuideIdentity): GuidePersistence {
  if (typeof window === 'undefined') return emptyGuideState();
  try {
    const raw = localStorage.getItem(guideStorageKey(identity));
    if (!raw) return emptyGuideState();
    const parsed = JSON.parse(raw) as GuidePersistence;
    if (parsed.version !== CLINIC_GUIDE_VERSION) return emptyGuideState();
    return {
      ...emptyGuideState(),
      ...parsed,
      chapters: parsed.chapters || {},
    };
  } catch {
    return emptyGuideState();
  }
}

export function saveGuideState(identity: GuideIdentity, state: GuidePersistence) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(guideStorageKey(identity), JSON.stringify({ ...state, version: CLINIC_GUIDE_VERSION }));
}

export function chapterHasProgress(state: GuidePersistence, chapterId: GuideChapterId): boolean {
  const ch = state.chapters[chapterId];
  if (!ch) return false;
  return !ch.completed && !ch.skipped;
}

export function resumeChapterId(
  state: GuidePersistence,
  _role: ClinicGuideRole,
  available: GuideChapterId[],
): GuideChapterId | null {
  if (state.activeChapterId && available.includes(state.activeChapterId)) {
    const active = state.chapters[state.activeChapterId];
    if (active && !active.completed && !active.skipped && active.stepIndex > 0) {
      return state.activeChapterId;
    }
  }
  for (const id of available) {
    if (chapterHasProgress(state, id)) return id;
  }
  return null;
}

/** True when user has never completed welcome for this identity + version. */
export function shouldOfferWelcome(state: GuidePersistence): boolean {
  return !state.welcomed && !state.exploreOwn;
}
