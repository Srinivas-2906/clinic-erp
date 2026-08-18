import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, RefreshCw, Search, Rows3 } from 'lucide-react';
import { LoginGate } from './components/LoginGate';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { OverviewTab } from './components/OverviewTab';
import { TodayView } from './components/TodayView';
import { PatientsView } from './components/PatientsView';
import { PatientDetail, BookView } from './components/PatientDetail';
import { Toaster } from './components/Toaster';
import { PaymentsView } from './components/PaymentsView';
import { ReportsView } from './components/ReportsView';
import { GlobalSearchDialog } from './components/GlobalSearchDialog';
import { TeamAccessView } from './components/TeamAccessView';
import { DoctorsView } from './components/DoctorsView';
import { SetPasswordScreen } from './components/SetPasswordScreen';
import { useKeyboardOpen } from './hooks/useKeyboardOpen';
import { useTodayData } from './hooks/useTodayData';
import { fetchPatients, fetchPatient, fetchClient, fetchPayments, fetchMe, fetchClinicReport, fetchAppointments } from './lib/api';
import { resolveClinicProfile, type ClinicProfile } from './lib/clinicBranding';
import { formatApptDayLabel, formatApptTime, isApptToday, clinicTodayYmd, apptDayKey, monthStartYmd, monthEndYmd } from './lib/appointmentDisplay';
import { logout } from './lib/auth';
import { isDenseMode, setDenseMode } from './lib/denseMode';
import type { Patient, TabId, ToastMsg, Payment, PaymentSummary, Appointment } from './types';
import './styles.css';

const PAGE_TITLES: Record<TabId, { title: string; sub: string }> = {
  overview:  { title: 'Home',      sub: 'What is happening today' },
  today:     { title: 'Schedule',  sub: 'Calendar and daily appointments' },
  patients:  { title: 'Patients',  sub: 'Find a patient' },
  book:      { title: 'Book',      sub: 'Add a new appointment' },
  payments:  { title: 'Payments',  sub: 'Payments and due' },
  reports:   { title: 'Reports',   sub: 'Payments and follow-up' },
  doctors:   { title: 'Doctors',   sub: 'Manage clinic doctors' },
  team:      { title: 'Team',      sub: 'Approve staff login' },
};

function ClinicApp() {
  const [tab,           setTab]           = useState<TabId>('overview');
  const [collapsed,     setCollapsed]     = useState(false);
  const [doctorFilter,  setDoctorFilter]  = useState<string | null>(null);
  const { today, rawToday, refetch: loadToday } = useTodayData(doctorFilter);
  const [patients,      setPatients]      = useState<Patient[]>([]);
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [patientDetail, setPatientDetail] = useState<{ patient: Patient; appointments: import('./types').Appointment[] } | null>(null);
  const [clinicName,    setClinicName]    = useState('Clinic');
  const [clinicEmoji,   setClinicEmoji]   = useState('🏥');
  const [clinicProfile, setClinicProfile] = useState<ClinicProfile>(() => resolveClinicProfile(null));
  const [toasts,        setToasts]        = useState<ToastMsg[]>([]);
  const [prefillPt,     setPrefillPt]     = useState<Patient | null>(null);
  const [showUserMenu,  setShowUserMenu]  = useState(false);
  const [showSearch,    setShowSearch]    = useState(false);
  const [displayName,   setDisplayName]   = useState<string>('');
  const [userRole,      setUserRole]      = useState<string>('');
  const [denseMode,     setDenseModeOn]   = useState(() => isDenseMode());
  const [payments,      setPayments]      = useState<Payment[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({ todayTotal: 0, monthTotal: 0, dueCount: 0 });
  const [reportRange, setReportRange] = useState<{ from: string; to: string } | null>(null);
  const [report, setReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(clinicTodayYmd);
  const [scheduleAppts, setScheduleAppts] = useState<Appointment[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const userMenuRef = useRef<HTMLDivElement>(null);
  const lastApiErrorRef = useRef<{ at: number; msg: string } | null>(null);

  useEffect(() => {
    if (!showUserMenu) return;
    function onDocClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showUserMenu]);

  /* ── Toast ── */
  function toast(text: string, type: 'ok' | 'err' = 'ok') {
    const id = Date.now();
    setToasts(ts => [...ts, { id, text, type }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 3500);
  }
  function dismissToast(id: number) { setToasts(ts => ts.filter(t => t.id !== id)); }

  function toggleDense() {
    setDenseMode(!denseMode);
    setDenseModeOn(!denseMode);
    toast(!denseMode ? 'Compact view on' : 'Compact view off');
  }

  function toastApiError(e: unknown) {
    const msg = e instanceof Error ? e.message : 'API error';
    const now = Date.now();
    const prev = lastApiErrorRef.current;
    // Avoid spamming (polling / repeated failures)
    if (prev && prev.msg === msg && now - prev.at < 60_000) return;
    lastApiErrorRef.current = { msg, at: now };
    toast(msg, 'err');
  }

  /* ── Data loaders ── */
  const loadPatients = useCallback(async (search?: string) => {
    try { setPatients(await fetchPatients(search)); } catch (e) { toastApiError(e); }
  }, []);

  const loadPatientDetail = useCallback(async (id: string) => {
    try {
      const data = await fetchPatient(id);
      setPatientDetail(data);
      setSelectedId(id);
      return true;
    } catch {
      toast('Could not load patient', 'err');
      return false;
    }
  }, []);

  const loadPayments = useCallback(async () => {
    try {
      const data = await fetchPayments();
      setPayments(data.payments || []);
      setPaymentSummary(data.summary || { todayTotal: 0, monthTotal: 0, dueCount: 0 });
    } catch (e) {
      toastApiError(e);
    }
  }, []);

  useEffect(() => {
    loadPatients();
    fetchClient().then((c) => {
      const profile = resolveClinicProfile(c);
      setClinicProfile(profile);
      if (profile.name) setClinicName(profile.name);
      if (profile.emoji) setClinicEmoji(profile.emoji);
    }).catch(() => {});
    fetchMe().then((m) => {
      const n = m?.user?.name || m?.user?.username || m?.user?.email || '';
      if (n) setDisplayName(n);
      if (m?.user?.role) setUserRole(m.user.role);
    }).catch(() => {});
  }, [loadPatients]);

  // Poll "today" only when it matters (Home/Today) and only while tab is visible.
  useEffect(() => {
    let interval: number | null = null;

    function shouldPoll() {
      if (document.visibilityState !== 'visible') return false;
      return tab === 'today' || tab === 'overview';
    }

    async function tick() {
      if (!shouldPoll()) return;
      try {
        await loadToday();
      } catch (e) {
        toastApiError(e);
      }
    }

    function start(ms: number) {
      if (interval) window.clearInterval(interval);
      interval = window.setInterval(() => { void tick(); }, ms);
    }

    // Fast refresh when user is actively looking at Today/Home.
    start(15_000);
    void tick();

    function onVisibility() {
      if (document.visibilityState === 'visible') void tick();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (interval) window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [tab, loadToday]);

  useEffect(() => {
    if (tab !== 'payments') return;
    loadPayments();
    loadPatients();
  }, [tab, loadPayments, loadPatients]);

  const loadScheduleDay = useCallback(async (date: string) => {
    setScheduleLoading(true);
    try {
      setScheduleAppts(await fetchAppointments({ date }));
    } catch (e) {
      toastApiError(e);
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  const loadMonthCounts = useCallback(async (year: number, month: number) => {
    const from = monthStartYmd(year, month);
    const to = monthEndYmd(year, month);
    try {
      const appts = await fetchAppointments({ from, to });
      const counts: Record<string, number> = {};
      for (const a of appts) {
        if (a.status === 'cancelled' || a.status === 'no_show') continue;
        const k = apptDayKey(a.scheduledAt);
        counts[k] = (counts[k] || 0) + 1;
      }
      setMonthCounts(counts);
    } catch {
      /* calendar badges are non-critical */
    }
  }, []);

  const refreshSchedule = useCallback(async () => {
    await Promise.all([
      loadScheduleDay(scheduleDate),
      loadMonthCounts(calendarMonth.year, calendarMonth.month),
      loadToday(),
    ]);
    loadPatients();
  }, [scheduleDate, calendarMonth.year, calendarMonth.month, loadScheduleDay, loadMonthCounts, loadToday, loadPatients]);

  useEffect(() => {
    if (tab !== 'today') return;
    void loadScheduleDay(scheduleDate);
    void loadMonthCounts(calendarMonth.year, calendarMonth.month);
  }, [tab, scheduleDate, calendarMonth.year, calendarMonth.month, loadScheduleDay, loadMonthCounts]);

  const scheduleForDoctor = useMemo(() => {
    if (!doctorFilter) return scheduleAppts;
    return scheduleAppts.filter((a) => a.assignedDoctorId === doctorFilter);
  }, [scheduleAppts, doctorFilter]);

  const loadReport = useCallback(async (from: string, to: string) => {
    setReportRange({ from, to });
    setReportLoading(true);
    try {
      setReport(await fetchClinicReport(from, to));
    } catch (e) {
      toastApiError(e);
    } finally {
      setReportLoading(false);
    }
  }, []);

  /* ── Navigation helpers ── */
  async function handleOpenPatient(id: string) {
    if (!id) {
      toast('Patient record not linked to this booking', 'err');
      return;
    }
    const ok = await loadPatientDetail(id);
    if (!ok) toast('Could not load patient', 'err');
  }

  function handleBooked(scheduledAt: string) {
    void loadToday();
    void refreshSchedule();
    setPrefillPt(null);
    const day = apptDayKey(scheduledAt);
    setScheduleDate(day);
    const d = new Date(`${day}T12:00:00`);
    setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() });
    setTab('today');
    if (!isApptToday(scheduledAt)) {
      toast(`Booked for ${formatApptDayLabel(scheduledAt)} · ${formatApptTime(scheduledAt)}`);
    }
  }

  function handleTabChange(t: TabId) {
    setTab(t);
    setSelectedId(null);
    setPatientDetail(null);
    setPrefillPt(null);
    if (t === 'patients') loadPatients();
    if (t === 'overview' || t === 'today') void loadToday();
    if (t === 'today') void refreshSchedule();
  }

  function handleScheduleDateChange(ymd: string) {
    setScheduleDate(ymd);
  }

  function handleCalendarMonthChange(year: number, month: number) {
    setCalendarMonth({ year, month });
  }

  function handleSearchOpen() {
    setShowSearch(true);
  }

  function handleBookFollowup(patient: Patient) {
    setPrefillPt(patient);
    setSelectedId(null);
    setPatientDetail(null);
    setTab('book');
  }

  function handleCancelBookPrefill() {
    const pt = prefillPt;
    setPrefillPt(null);
    if (pt) {
      setTab('patients');
      loadPatientDetail(pt.id);
    } else {
      setTab('book');
    }
  }

  const pageInfo = PAGE_TITLES[tab];
  const isPatientOpen = Boolean(selectedId && patientDetail);
  const keyboardOpen = useKeyboardOpen();
  const hideBottomNav = isPatientOpen || keyboardOpen;
  const initials = clinicName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'AD';

  return (
    <div className={`clinic-app${keyboardOpen ? ' keyboard-open' : ''}`}>
      {/* Sidebar — desktop */}
      <Sidebar
        active={isPatientOpen ? 'patients' : tab}
        collapsed={collapsed}
        onChange={handleTabChange}
        onToggle={() => setCollapsed(c => !c)}
        brandName={`${clinicEmoji} ${clinicName}`}
        brandSub="Clinic desk"
        userInitials={initials}
        showOwnerNav={userRole === 'owner'}
      />

      <div className={`clinic-main${isPatientOpen ? ' patient-detail-open' : ''}`}>
        {/* Mobile top bar */}
        <div className={`top-bar${isPatientOpen ? ' top-bar-patient' : ''}`}>
          {isPatientOpen ? (
            <>
              <button
                type="button"
                className="top-bar-back"
                onClick={() => { setSelectedId(null); setPatientDetail(null); }}
                aria-label="Back"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div className="top-bar-text">
                <span className="top-bar-name">{patientDetail!.patient.name}</span>
                <span className="top-bar-sub">{patientDetail!.patient.phone}</span>
              </div>
            </>
          ) : (
            <div className="top-bar-brand">
              <div className="top-bar-logo">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3c-1.2 0-2.4.6-3 1.5C8.4 5.4 8 7 8 8.5c0 1.5.4 3 .8 4.5.4 1.5.5 3 .5 4 0 1 .4 2 1.2 2s1.2-1.3 1.5-3c.3 1.7.7 3 1.5 3s1.2-1 1.2-2c0-1 .1-2.5.5-4 .4-1.5.8-3 .8-4.5 0-1.5-.4-3.1-1-4C15.4 3.6 13.2 3 12 3z"/>
                </svg>
              </div>
              <div className="top-bar-text">
                <span className="top-bar-name">{clinicName}</span>
                <span className="top-bar-sub">Clinic desk</span>
              </div>
            </div>
          )}
          {!isPatientOpen && (
            <div className="top-bar-actions">
              <button type="button" className="icon-btn" onClick={handleSearchOpen} aria-label="Search">
                <Search size={18} />
              </button>
              <div className="user-menu-wrap" ref={userMenuRef}>
                <button
                  type="button"
                  className="top-bar-avatar"
                  title="Account"
                  onClick={() => setShowUserMenu((v) => !v)}
                  aria-label="Account menu"
                >
                  {initials}
                </button>
                {showUserMenu && (
                  <div className="user-menu">
                    <div className="user-menu-name">{clinicName}</div>
                    <button type="button" className="user-menu-item" onClick={logout}>
                      <LogOut size={14} /> Log out
                    </button>
                    {userRole === 'owner' && (
                      <>
                        <button type="button" className="user-menu-item" onClick={() => { setShowUserMenu(false); handleTabChange('doctors'); }}>
                          Doctors
                        </button>
                        <button type="button" className="user-menu-item" onClick={() => { setShowUserMenu(false); handleTabChange('team'); }}>
                          Team
                        </button>
                      </>
                    )}
                    <button type="button" className="user-menu-item" onClick={() => { setShowUserMenu(false); toggleDense(); }}>
                      <Rows3 size={14} /> {denseMode ? 'Normal view' : 'Compact view'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Desktop topbar */}
        <div className="desktop-topbar">
          <div className="desktop-topbar-title">
            <h2>{isPatientOpen ? patientDetail!.patient.name : pageInfo.title}</h2>
            <p>{isPatientOpen ? `Patient · ${clinicName}` : pageInfo.sub}</p>
          </div>
          <div className="desktop-topbar-right">
            {!isPatientOpen && (
              <button type="button" className="icon-btn" onClick={handleSearchOpen} aria-label="Search">
                <Search size={15} />
              </button>
            )}
            {(tab === 'today' || tab === 'overview') && !isPatientOpen && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => { tab === 'today' ? void refreshSchedule() : void loadToday(); }}
                aria-label="Refresh"
              >
                <RefreshCw size={15} />
              </button>
            )}
            <button
              type="button"
              className={`icon-btn${denseMode ? ' active' : ''}`}
              onClick={toggleDense}
              aria-label={denseMode ? 'Switch to normal view' : 'Switch to compact view'}
              title={denseMode ? 'Normal view' : 'Compact view'}
            >
              <Rows3 size={15} />
            </button>
            <div className="dt-avatar" title="Admin">{initials}</div>
          </div>
        </div>

        {/* Content */}
        <main className={`main-content${hideBottomNav ? ' no-bottom-nav' : ''}`}>
          {isPatientOpen ? (
            <PatientDetail
              patient={patientDetail!.patient}
              appointments={patientDetail!.appointments}
              clinicProfile={clinicProfile}
              onBack={() => { setSelectedId(null); setPatientDetail(null); }}
              onUpdated={() => loadPatientDetail(selectedId!)}
              onToast={toast}
              onBookFollowup={handleBookFollowup}
            />
          ) : tab === 'overview' ? (
            <OverviewTab
              today={today}
              rawToday={rawToday}
              doctorFilter={doctorFilter}
              onDoctorFilterChange={setDoctorFilter}
              displayName={displayName}
              onGoToToday={() => handleTabChange('today')}
              onGoToBook={() => handleTabChange('book')}
              onOpenPatient={handleOpenPatient}
              onToast={toast}
              onRefresh={() => { void loadToday(); }}
            />
          ) : tab === 'today' ? (
            <TodayView
              appointments={scheduleForDoctor}
              rawAppointments={scheduleAppts}
              doctorFilter={doctorFilter}
              onDoctorFilterChange={setDoctorFilter}
              selectedDate={scheduleDate}
              calendarYear={calendarMonth.year}
              calendarMonth={calendarMonth.month}
              monthCounts={monthCounts}
              loading={scheduleLoading}
              onDateChange={handleScheduleDateChange}
              onMonthChange={handleCalendarMonthChange}
              onRefresh={() => { void refreshSchedule(); }}
              onOpenPatient={handleOpenPatient}
              onGoToBook={() => handleTabChange('book')}
              onToast={toast}
            />
          ) : tab === 'patients' ? (
            <PatientsView
              patients={patients}
              onSelect={loadPatientDetail}
              onToast={toast}
              onPatientSaved={loadPatients}
              onPaymentRecorded={() => { loadPatients(); loadPayments(); }}
            />
          ) : tab === 'payments' ? (
            <PaymentsView
              summary={paymentSummary}
              payments={payments}
              patients={patients}
              clinicProfile={clinicProfile}
              onRecorded={() => { loadPayments(); void loadToday(); loadPatients(); }}
              onOpenPatient={handleOpenPatient}
            />
          ) : tab === 'reports' ? (
            <ReportsView
              appliedFrom={reportRange?.from}
              appliedTo={reportRange?.to}
              report={report}
              loading={reportLoading}
              today={rawToday}
              patients={patients}
              onLoadReport={loadReport}
              onRefresh={() => reportRange && loadReport(reportRange.from, reportRange.to)}
              onOpenPatient={handleOpenPatient}
              onGoToToday={() => handleTabChange('today')}
              onToast={toast}
            />
          ) : tab === 'doctors' ? (
            userRole === 'owner' ? (
              <DoctorsView onToast={toast} />
            ) : (
              <div className="doctors-empty">Only the clinic owner can manage doctors.</div>
            )
          ) : tab === 'team' ? (
            <TeamAccessView onToast={toast} />
          ) : (
            <BookView
              onBooked={handleBooked}
              onToast={toast}
              prefillPatient={prefillPt}
              onCancelPrefill={prefillPt ? handleCancelBookPrefill : undefined}
            />
          )}
        </main>

        {/* Mobile bottom nav */}
        {!hideBottomNav && <BottomNav active={tab} onChange={handleTabChange} />}
      </div>

      {/* Toast notifications */}
      <Toaster toasts={toasts} onDismiss={dismissToast} />

      {showSearch && (
        <GlobalSearchDialog
          todayAppointments={rawToday?.appointments ?? []}
          onClose={() => setShowSearch(false)}
          onOpenPatient={handleOpenPatient}
          onToast={toast}
          onGoToToday={() => { setShowSearch(false); handleTabChange('today'); }}
        />
      )}
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const setPasswordToken = params.get('set-password');
  if (setPasswordToken) {
    return <SetPasswordScreen token={setPasswordToken} />;
  }

  return (
    <LoginGate>
      <ClinicApp />
    </LoginGate>
  );
}
