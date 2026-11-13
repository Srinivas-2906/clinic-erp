import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { TabId, UserCapabilities } from '../types';
import { GUIDE_CHAPTERS } from './chapters';
import { chaptersForRole, stepsForChapter } from './filterSteps';
import {
  chapterHasProgress,
  loadGuideState,
  resumeChapterId,
  saveGuideState,
  shouldOfferWelcome,
  type GuideIdentity,
} from './storage';
import type { ClinicGuideRole, GuideChapterId, GuidePersistence, GuideStep } from './types';

type GuideStatus = 'idle' | 'welcome' | 'active' | 'paused' | 'picker';

export type ClinicGuideContextValue = {
  status: GuideStatus;
  demoMode: boolean;
  activeChapterId: GuideChapterId | null;
  step: GuideStep | null;
  stepIndex: number;
  stepCount: number;
  targetMissing: boolean;
  welcomeOpen: boolean;
  pickerOpen: boolean;
  canResume: GuideChapterId | null;
  chapters: ReturnType<typeof chaptersForRole>;
  setDemoMode: (v: boolean) => void;
  startWelcome: () => void;
  dismissWelcomeExplore: () => void;
  startChapter: (chapterId: GuideChapterId, fromStep?: number) => void;
  resumeJourney: () => void;
  pauseTour: () => void;
  exitTour: () => void;
  skipStep: () => void;
  skipChapter: () => void;
  backStep: () => void;
  openPicker: () => void;
  closePicker: () => void;
  restartChapter: (chapterId: GuideChapterId) => void;
  notifyTargetMissingAdvance: () => void;
};

const ClinicGuideContext = createContext<ClinicGuideContextValue | null>(null);

export function useClinicGuide() {
  const ctx = useContext(ClinicGuideContext);
  if (!ctx) throw new Error('useClinicGuide requires ClinicGuideProvider');
  return ctx;
}

export function useClinicGuideOptional() {
  return useContext(ClinicGuideContext);
}

type ProviderProps = {
  tenantSlug: string;
  userId: string;
  userRole: string;
  userCaps: Required<UserCapabilities>;
  tab: TabId;
  onTabChange: (tab: TabId) => void;
  children: ReactNode;
};

function normalizeRole(role: string): ClinicGuideRole {
  const r = role === 'staff' ? 'receptionist' : role;
  if (r === 'owner' || r === 'receptionist' || r === 'doctor') return r;
  return 'receptionist';
}

export function ClinicGuideProvider({
  tenantSlug,
  userId,
  userRole,
  userCaps,
  tab,
  onTabChange,
  children,
}: ProviderProps) {
  const identity = useMemo<GuideIdentity>(
    () => ({
      tenantSlug: tenantSlug || 'default',
      userId: userId || 'anon',
      role: normalizeRole(userRole),
    }),
    [tenantSlug, userId, userRole],
  );

  const normalizedRole = useMemo(() => normalizeRole(userRole), [userRole]);
  const [persisted, setPersisted] = useState<GuidePersistence>(() => loadGuideState(identity));
  const [status, setStatus] = useState<GuideStatus>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const [targetMissing, setTargetMissing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [runtimeChapterId, setRuntimeChapterId] = useState<GuideChapterId | null>(null);
  const advanceLock = useRef(false);

  const chapters = useMemo(() => chaptersForRole(normalizedRole, userCaps), [normalizedRole, userCaps]);
  const availableChapterIds = useMemo(() => chapters.map((c) => c.id), [chapters]);
  const activeChapterId = runtimeChapterId ?? persisted.activeChapterId;

  const steps = useMemo(() => {
    if (!activeChapterId) return [];
    return stepsForChapter(activeChapterId, normalizedRole, userCaps);
  }, [activeChapterId, normalizedRole, userCaps]);

  const step = status === 'active' && steps[stepIndex] ? steps[stepIndex] : null;
  const stepCount = steps.length;

  const persist = useCallback(
    (next: GuidePersistence) => {
      setPersisted(next);
      saveGuideState(identity, next);
    },
    [identity],
  );

  const writeChapterProgress = useCallback(
    (chapterId: GuideChapterId, patch: Partial<{ stepIndex: number; completed: boolean; skipped: boolean }>) => {
      const prev = persisted.chapters[chapterId] || { stepIndex: 0, completed: false, skipped: false };
      persist({
        ...persisted,
        chapters: {
          ...persisted.chapters,
          [chapterId]: { ...prev, ...patch },
        },
      });
    },
    [persist, persisted],
  );

  const canResume = useMemo(
    () => resumeChapterId(persisted, identity.role, availableChapterIds),
    [persisted, identity.role, availableChapterIds],
  );

  const identityKey = `${identity.tenantSlug}:${identity.userId}:${identity.role}`;
  const loadedIdentity = useRef('');

  useEffect(() => {
    if (!userId) return;
    if (loadedIdentity.current === identityKey) return;
    loadedIdentity.current = identityKey;
    setPersisted(loadGuideState(identity));
  }, [identity, identityKey, userId]);

  useEffect(() => {
    if (!userRole || !userId) return;
    const fresh = loadGuideState(identity);
    setPersisted(fresh);
    setStatus((prev) => {
      if (prev !== 'idle') return prev;
      return shouldOfferWelcome(fresh) ? 'welcome' : 'idle';
    });
  }, [userRole, userId, identity]);

  useEffect(() => {
    if (status !== 'active' || !step) return;
    setTargetMissing(false);
    advanceLock.current = false;
    if (step.tab && tab !== step.tab) {
      onTabChange(step.tab);
    }
  }, [status, step, tab, onTabChange]);

  const goNext = useCallback(() => {
    if (!activeChapterId || !steps.length) return;
    const nextIndex = stepIndex + 1;
    if (nextIndex >= steps.length) {
      writeChapterProgress(activeChapterId, { stepIndex: nextIndex, completed: true, skipped: false });
      persist({ ...persisted, activeChapterId: null });
      setRuntimeChapterId(null);
      setStatus('idle');
      setStepIndex(0);
      return;
    }
    writeChapterProgress(activeChapterId, { stepIndex: nextIndex, completed: false, skipped: false });
    setStepIndex(nextIndex);
  }, [activeChapterId, stepIndex, steps.length, writeChapterProgress, persist, persisted]);

  const tryAdvance = useCallback(() => {
    if (advanceLock.current) return;
    advanceLock.current = true;
    goNext();
  }, [goNext]);

  useEffect(() => {
    if (status !== 'active' || !step) return;

    const advance = step.advance;

    if (advance.type === 'tab-active') {
      if (tab === advance.tab) tryAdvance();
      return;
    }

    if (advance.type === 'explain') {
      return;
    }

    if (!step.target) return;
    const el = document.querySelector(step.target);
    if (!el) {
      if (step.optional) {
        setTargetMissing(true);
      } else {
        setTargetMissing(true);
      }
      return;
    }

    if (advance.type === 'click-target') {
      const onClick = () => tryAdvance();
      el.addEventListener('click', onClick, { once: true, capture: true });
      return () => el.removeEventListener('click', onClick, { capture: true });
    }

    if (advance.type === 'focus-target') {
      const onFocus = () => tryAdvance();
      el.addEventListener('focus', onFocus, { once: true, capture: true });
      return () => el.removeEventListener('focus', onFocus, { capture: true });
    }

    if (advance.type === 'input-nonempty') {
      const input = el as HTMLInputElement;
      const check = () => {
        if (input.value.trim().length > 0) tryAdvance();
      };
      input.addEventListener('input', check);
      check();
      return () => input.removeEventListener('input', check);
    }
  }, [status, step, tab, tryAdvance]);

  const startChapter = useCallback(
    (chapterId: GuideChapterId, fromStep = 0) => {
      const list = stepsForChapter(chapterId, normalizedRole, userCaps);
      if (!list.length) return;
      const idx = Math.min(fromStep, list.length - 1);
      setRuntimeChapterId(chapterId);
      persist({ ...persisted, activeChapterId: chapterId, welcomed: true, exploreOwn: false });
      writeChapterProgress(chapterId, { stepIndex: idx, completed: false, skipped: false });
      setStepIndex(idx);
      setStatus('active');
      setPickerOpen(false);
    },
    [persist, persisted, normalizedRole, userCaps, writeChapterProgress],
  );

  const resumeJourney = useCallback(() => {
    const id = canResume || chapters[0]?.id;
    if (!id) return;
    const prog = persisted.chapters[id];
    const idx = prog?.stepIndex ?? 0;
    startChapter(id, idx);
  }, [canResume, chapters, persisted.chapters, startChapter]);

  const value = useMemo<ClinicGuideContextValue>(
    () => ({
      status,
      demoMode: persisted.demoMode,
      activeChapterId,
      step,
      stepIndex,
      stepCount,
      targetMissing,
      welcomeOpen: status === 'welcome',
      pickerOpen,
      canResume,
      chapters,
      setDemoMode: (v) => persist({ ...persisted, demoMode: v }),
      startWelcome: () => setStatus('welcome'),
      dismissWelcomeExplore: () => {
        persist({ ...persisted, welcomed: true, exploreOwn: true });
        setStatus('idle');
      },
      startChapter,
      resumeJourney,
      pauseTour: () => {
        if (activeChapterId) writeChapterProgress(activeChapterId, { stepIndex });
        setStatus('paused');
      },
      exitTour: () => {
        if (activeChapterId) writeChapterProgress(activeChapterId, { stepIndex });
        persist({ ...persisted, activeChapterId: null });
        setRuntimeChapterId(null);
        setStatus('idle');
        setStepIndex(0);
      },
      skipStep: () => goNext(),
      skipChapter: () => {
        if (activeChapterId) writeChapterProgress(activeChapterId, { skipped: true, completed: false, stepIndex });
        persist({ ...persisted, activeChapterId: null });
        setRuntimeChapterId(null);
        setStatus('idle');
        setStepIndex(0);
      },
      backStep: () => {
        if (!activeChapterId) return;
        const idx = Math.max(0, stepIndex - 1);
        setStepIndex(idx);
        writeChapterProgress(activeChapterId, { stepIndex: idx });
      },
      openPicker: () => {
        setPickerOpen(true);
        setStatus((s) => (s === 'active' ? 'active' : 'picker'));
      },
      closePicker: () => {
        setPickerOpen(false);
        if (status === 'picker') setStatus('idle');
      },
      restartChapter: (chapterId: GuideChapterId) => {
        writeChapterProgress(chapterId, { stepIndex: 0, completed: false, skipped: false });
        startChapter(chapterId, 0);
      },
      notifyTargetMissingAdvance: () => {
        if (step?.optional) goNext();
      },
    }),
    [
      status,
      persisted,
      activeChapterId,
      step,
      stepIndex,
      stepCount,
      targetMissing,
      pickerOpen,
      canResume,
      chapters,
      persist,
      startChapter,
      resumeJourney,
      writeChapterProgress,
      goNext,
    ],
  );

  return <ClinicGuideContext.Provider value={value}>{children}</ClinicGuideContext.Provider>;
}

export function guideChapterMeta(id: GuideChapterId) {
  return GUIDE_CHAPTERS.find((c) => c.id === id);
}

export function guideHasResume(persisted: GuidePersistence, role: string, caps: Required<UserCapabilities>) {
  const chapters = chaptersForRole(role, caps).map((c) => c.id);
  return chapters.some((id) => chapterHasProgress(persisted, id));
}
