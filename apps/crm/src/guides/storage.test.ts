import { describe, expect, it, beforeEach } from 'vitest';
import { CLINIC_GUIDE_VERSION } from './constants';
import {
  chapterHasProgress,
  emptyGuideState,
  guideStorageKey,
  loadGuideState,
  resumeChapterId,
  saveGuideState,
  shouldOfferWelcome,
} from './storage';

const identity = { tenantSlug: 'dentacare', userId: 'user-a', role: 'owner' as const };

describe('guide storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isolates keys by tenant, user, and role', () => {
    const k1 = guideStorageKey(identity);
    const k2 = guideStorageKey({ ...identity, userId: 'user-b' });
    const k3 = guideStorageKey({ ...identity, role: 'doctor' });
    expect(k1).not.toEqual(k2);
    expect(k1).not.toEqual(k3);
    expect(k1).toContain(CLINIC_GUIDE_VERSION);
  });

  it('persists and reloads chapter progress', () => {
    const state = {
      ...emptyGuideState(),
      welcomed: true,
      chapters: {
        'owner-clinic-setup': { stepIndex: 2, completed: false, skipped: false },
      },
    };
    saveGuideState(identity, state);
    const loaded = loadGuideState(identity);
    expect(loaded.chapters['owner-clinic-setup']?.stepIndex).toBe(2);
  });

  it('offers welcome until welcomed or explore own', () => {
    expect(shouldOfferWelcome(emptyGuideState())).toBe(true);
    expect(shouldOfferWelcome({ ...emptyGuideState(), welcomed: true })).toBe(false);
    expect(shouldOfferWelcome({ ...emptyGuideState(), exploreOwn: true })).toBe(false);
  });

  it('finds resume chapter', () => {
    const state = {
      ...emptyGuideState(),
      activeChapterId: 'receptionist-front-desk' as const,
      chapters: {
        'receptionist-front-desk': { stepIndex: 0, completed: false, skipped: false },
      },
    };
    expect(chapterHasProgress(state, 'receptionist-front-desk')).toBe(true);
    expect(resumeChapterId(state, 'owner', ['owner-clinic-setup', 'receptionist-front-desk'])).toBe(
      'receptionist-front-desk',
    );
  });
});
