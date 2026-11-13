import type { TabId, UserCapabilities } from '../types';

export type ClinicGuideRole = 'owner' | 'receptionist' | 'doctor';

export type GuideAdvance =
  | { type: 'click-target' }
  | { type: 'tab-active'; tab: TabId }
  | { type: 'input-nonempty' }
  | { type: 'focus-target' }
  | { type: 'explain' };

export type GuideChapterId =
  | 'owner-clinic-setup'
  | 'receptionist-front-desk'
  | 'doctor-clinical-day'
  | 'clinic-day-handoffs';

export type GuideStep = {
  id: string;
  chapterId: GuideChapterId;
  title: string;
  body: string;
  action: string;
  tab?: TabId;
  target?: string;
  advance: GuideAdvance;
  roles: ClinicGuideRole[];
  requiresCap?: keyof UserCapabilities;
  optional?: boolean;
};

export type GuideChapterMeta = {
  id: GuideChapterId;
  title: string;
  subtitle: string;
  roles: ClinicGuideRole[];
};

export type GuideChapterProgress = {
  stepIndex: number;
  completed: boolean;
  skipped: boolean;
};

export type GuidePersistence = {
  version: string;
  demoMode: boolean;
  welcomed: boolean;
  exploreOwn: boolean;
  activeChapterId: GuideChapterId | null;
  chapters: Partial<Record<GuideChapterId, GuideChapterProgress>>;
};
