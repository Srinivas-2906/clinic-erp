import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Phone, MessageSquare, LayoutList, Columns3, Banknote, MoreVertical, ChevronDown, ChevronUp } from 'lucide-react';
import type { Appointment, AppointmentStatus } from '../types';
import { STATUS_LABELS } from '../types';
import { updateAppointment } from '../lib/api';
import { toTelUrl, toWhatsAppUrl } from '../lib/phone';
import { formatApptTime, formatScheduleHeader } from '../lib/appointmentDisplay';
import { buildDoctorColorMap, doctorColorFor } from '../lib/doctorDisplay';
import { countAppointmentsByDoctor, dayAppointmentStats } from '../lib/todayStats';
import { useDoctors } from '../hooks/useDoctors';
import { AppointmentBoard } from './AppointmentBoard';
import { CalendarMonth } from './CalendarMonth';
import { CompleteVisitDialog } from './CompleteVisitDialog';
import { AppointmentActionsDialog } from './AppointmentActionsDialog';
import { DoctorFilterChips } from './DoctorFilterChips';
import { DoctorBadge } from './DoctorBadge';

type TodayViewMode = 'list' | 'board';
type StatusFilter = 'all' | 'requested' | 'confirmed' | 'arrived';

const FILTER_CHIPS: { id: StatusFilter; tone: string; label: string; statKey: 'total' | 'unconfirmed' | 'confirmed' | 'arrived' }[] = [
  { id: 'all', tone: 'purple', label: 'all', statKey: 'total' },
  { id: 'requested', tone: 'amber', label: 'confirm', statKey: 'unconfirmed' },
  { id: 'confirmed', tone: 'blue', label: 'confirmed', statKey: 'confirmed' },
  { id: 'arrived', tone: 'green', label: 'arrived', statKey: 'arrived' },
];

const PALETTES: [string, string][] = [
  ['#1565C0','#e3f0fd'],['#0369a1','#e0f2fe'],['#7c3aed','#f5f3ff'],
  ['#059669','#ecfdf5'],['#b45309','#fef3c7'],['#be185d','#fce7f3'],['#0f766e','#ccfbf1'],
];
function ava(name: string): [string, string] { return PALETTES[name.charCodeAt(0) % PALETTES.length]; }

function splitTime(iso: string) {
  const t = formatApptTime(iso).toUpperCase();
  const parts = t.split(' ');
  return { hm: parts[0], ampm: parts[1] ?? '' };
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

const NEXT: Partial<Record<AppointmentStatus, AppointmentStatus>> = {
  requested: 'confirmed', confirmed: 'arrived', arrived: 'visited',
};

const ACTION_LABEL: Partial<Record<AppointmentStatus, string>> = {
  requested: 'Confirm',
  confirmed: 'Arrived',
  arrived:   'Complete',
};

const ACTION_CLASS: Partial<Record<AppointmentStatus, string>> = {
  requested: 'action-btn action-confirm',
  confirmed: 'action-btn action-arrived',
  arrived:   'action-btn action-done',
};

const TAG_CLASS: Record<AppointmentStatus, string> = {
  requested:'tag tag-warning', confirmed:'tag tag-brand', arrived:'tag tag-purple',
  visited:'tag tag-success',   cancelled:'tag tag-muted', no_show:'tag tag-muted',
};

interface Props {
  appointments: Appointment[];
  rawAppointments: Appointment[];
  doctorFilter: string | null;
  onDoctorFilterChange: (doctorId: string | null) => void;
  selectedDate: string;
  calendarYear: number;
  calendarMonth: number;
  monthCounts: Record<string, number>;
  loading?: boolean;
  onDateChange: (ymd: string) => void;
  onMonthChange: (year: number, month: number) => void;
  onRefresh: () => void;
  onOpenPatient: (patientId: string) => void;
  onGoToBook: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function TodayView({
  appointments,
  rawAppointments,
  doctorFilter,
  onDoctorFilterChange,
  selectedDate,
  calendarYear,
  calendarMonth,
  monthCounts,
  loading,
  onDateChange,
  onMonthChange,
  onRefresh,
  onOpenPatient,
  onGoToBook,
  onToast,
}: Props) {
  const [viewMode, setViewMode] = useState<TodayViewMode>(() => (isMobileViewport() ? 'list' : 'board'));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [collapseSessions, setCollapseSessions] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(() => !isMobileViewport());
  const [completeAppt, setCompleteAppt] = useState<Appointment | null>(null);
  const [actionsAppt, setActionsAppt] = useState<Appointment | null>(null);
  const headerLabel = formatScheduleHeader(selectedDate);
  const stats = useMemo(() => dayAppointmentStats(appointments), [appointments]);

  const { data: doctorsList = [] } = useDoctors(false);
  const activeDoctors = useMemo(
    () => doctorsList.filter((d) => d.isActive !== false),
    [doctorsList],
  );
  const multiDoctor = activeDoctors.length > 1;
  const doctorColorById = useMemo(() => buildDoctorColorMap(activeDoctors), [activeDoctors]);
  const doctorCounts = useMemo(
    () => countAppointmentsByDoctor(rawAppointments),
    [rawAppointments],
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => { if (mq.matches) setViewMode('list'); };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  async function advance(appt: Appointment) {
    const next = NEXT[appt.status];
    if (!next) return;
    if (next === 'visited') {
      setCompleteAppt(appt);
      return;
    }
    try {
      await updateAppointment(appt.id, { status: next });
      onRefresh();
      onToast(`${appt.patientName || 'Patient'} is now ${STATUS_LABELS[next].toLowerCase()}`);
    } catch { onToast('Could not save', 'err'); }
  }

  const sorted = useMemo(
    () => [...appointments]
      .filter((a) => a.status !== 'cancelled')
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [appointments],
  );

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return sorted;
    return sorted.filter((a) => a.status === statusFilter);
  }, [sorted, statusFilter]);

  function toggleStatusFilter(next: StatusFilter) {
    setStatusFilter((prev) => (prev === next ? 'all' : next));
  }

  const morning = filtered.filter(a => new Date(a.scheduledAt).getHours() < 14);
  const evening = filtered.filter(a => new Date(a.scheduledAt).getHours() >= 14);
  const showSessionSplit = !collapseSessions && morning.length > 0 && evening.length > 0;

  function AppointmentCard({ appt }: { appt: Appointment }) {
    const { hm, ampm } = splitTime(appt.scheduledAt);
    const name = appt.patientName || 'Patient';
    const [fg, bg] = ava(name);
    const telUrl = toTelUrl(appt.patientPhone);
    const waUrl = toWhatsAppUrl(appt.patientPhone);

    return (
      <li className={`appt-card status-${appt.status}`}>
        <div className="appt-left-bar" />
        <div className="appt-body">
          <div className="appt-time-col">
            <span className="appt-time">{hm}</span>
            <span className="appt-ampm">{ampm}</span>
          </div>
          <div className="appt-divider" />
          <div className="appt-avatar" style={{ background: bg, color: fg }}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="appt-info">
            <button type="button" className="appt-name" onClick={() => onOpenPatient(appt.patientId)}>
              {name}
            </button>
            <p className="appt-treatment">{appt.service || 'Check-up'}</p>
            <div className="appt-tags">
              <span className={TAG_CLASS[appt.status]}>{STATUS_LABELS[appt.status]}</span>
              <DoctorBadge
                name={appt.assignedDoctor}
                color={doctorColorFor(appt, doctorColorById)}
                compact
                show={multiDoctor}
              />
              {appt.source === 'WhatsApp' && <span className="tag tag-wa"><MessageSquare size={9}/> WA</span>}
              {appt.source === 'Website' && <span className="tag tag-web">Web</span>}
              {appt.paymentAmount != null && appt.paymentAmount > 0 && (
                <span className="tag tag-payment"><Banknote size={9}/> ₹{appt.paymentAmount.toLocaleString('en-IN')}</span>
              )}
            </div>
          </div>
          <div className="appt-action-col">
            {(telUrl || waUrl) && (
              <div className="quick-contact">
                {telUrl && (
                  <a href={telUrl} className="quick-action-btn" title={`Call ${name}`}>
                    <Phone size={12} />
                  </a>
                )}
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noreferrer" className="quick-action-btn quick-action-wa" title="WhatsApp">
                    <MessageSquare size={12} />
                  </a>
                )}
              </div>
            )}
            <button type="button" className="quick-action-btn" title="Actions" onClick={() => setActionsAppt(appt)}>
              <MoreVertical size={14} />
            </button>
            {NEXT[appt.status] && (
              <button type="button" className={ACTION_CLASS[appt.status]} onClick={() => advance(appt)}>
                {ACTION_LABEL[appt.status]}
              </button>
            )}
          </div>
        </div>
      </li>
    );
  }

  function ListBlock({ appts }: { appts: Appointment[] }) {
    return (
      <>
        <div className="appt-list-header" aria-hidden="true">
          <span>Time</span>
          <span>Patient</span>
          <span>What for</span>
          <span>Status</span>
          <span></span>
        </div>
        <ul className="appt-list appt-with-header">
          {appts.map(a => <AppointmentCard key={a.id} appt={a} />)}
        </ul>
      </>
    );
  }

  function SessionBlock({ label, appts, emptyMsg }: {
    label: string; appts: Appointment[]; emptyMsg: string;
  }) {
    return (
      <div className="session-block">
        <div className="session-header">
          <span className="session-label">{label}</span>
          <span className="session-count">{appts.length}</span>
        </div>
        {appts.length === 0 ? (
          <p className="session-empty">{emptyMsg}</p>
        ) : (
          <ListBlock appts={appts} />
        )}
      </div>
    );
  }

  return (
    <div className="view today-view">
      <header className="page-header page-header-compact">
        <div className="page-header-main">
          <div className="page-header-title-row">
            <h1 className="page-title">{headerLabel}</h1>
            <span className="page-title-meta">
              {loading ? 'Loading…' : `${stats.total} appt${stats.total !== 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="today-stat-row">
            <div className="header-stat-chips" role="toolbar" aria-label="Filter appointments">
              {FILTER_CHIPS.map(({ id, tone, label, statKey }) => (
                <button
                  key={id}
                  type="button"
                  className={`header-stat-chip ${tone}${statusFilter === id ? ' active' : ''}`}
                  aria-pressed={statusFilter === id}
                  onClick={() => toggleStatusFilter(id)}
                  title={statusFilter === id ? `Showing ${label} only — tap again for all` : `Show ${label} only`}
                >
                  <strong>{stats[statKey]}</strong> {label}
                </button>
              ))}
            </div>
            <button type="button" className="icon-btn today-refresh-btn" onClick={onRefresh} aria-label="Refresh">
              <RefreshCw size={15} />
            </button>
          </div>
          <DoctorFilterChips
            doctors={activeDoctors}
            value={doctorFilter}
            onChange={onDoctorFilterChange}
            counts={doctorCounts}
            totalCount={rawAppointments.length}
          />
        </div>
      </header>

      <div className="schedule-layout">
        <div className="schedule-calendar-col">
          <button
            type="button"
            className="calendar-collapse-toggle"
            onClick={() => setCalendarOpen((v) => !v)}
            aria-expanded={calendarOpen}
          >
            {calendarOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {calendarOpen ? 'Hide calendar' : 'Show calendar'}
          </button>
          {calendarOpen && (
            <CalendarMonth
              year={calendarYear}
              month={calendarMonth}
              selectedDate={selectedDate}
              counts={monthCounts}
              onSelectDate={onDateChange}
              onMonthChange={onMonthChange}
            />
          )}
        </div>

        <div className="schedule-day-col">
          {sorted.length > 0 && (
            <div className="today-toolbar">
              <div className="view-toggle view-toggle-desktop" role="tablist" aria-label="Schedule view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'board'}
                  className={`view-toggle-btn${viewMode === 'board' ? ' active' : ''}`}
                  onClick={() => setViewMode('board')}
                >
                  <Columns3 size={15} /> Board
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'list'}
                  className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`}
                  onClick={() => setViewMode('list')}
                >
                  <LayoutList size={15} /> List
                </button>
              </div>
              {viewMode === 'list' && morning.length > 0 && evening.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm today-session-toggle"
                  onClick={() => setCollapseSessions(v => !v)}
                >
                  {collapseSessions ? 'Split morning/evening' : 'One list'}
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="empty-state">
              <p className="muted">Loading schedule…</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
              </div>
              <h2>{doctorFilter ? 'No appointments for this doctor' : 'No appointments this day'}</h2>
              <p>
                {doctorFilter
                  ? 'Try another doctor or show everyone scheduled this day.'
                  : `Nothing booked for ${headerLabel}. Pick another date or add a booking.`}
              </p>
              {doctorFilter ? (
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => onDoctorFilterChange(null)}>
                  Show all doctors
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={onGoToBook}>
                  Book appointment
                </button>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state today-filter-empty">
              <h2>No {FILTER_CHIPS.find((c) => c.id === statusFilter)?.label ?? ''} appointments</h2>
              <p>Try another filter or show everyone scheduled this day.</p>
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setStatusFilter('all')}>
                Show all {stats.total}
              </button>
            </div>
          ) : viewMode === 'board' ? (
            <AppointmentBoard
              appointments={filtered}
              showDoctorBadges={multiDoctor}
              doctorColorById={doctorColorById}
              onRefresh={onRefresh}
              onOpenPatient={onOpenPatient}
              onToast={onToast}
            />
          ) : (
            showSessionSplit ? (
              <>
                <SessionBlock label="Morning" appts={morning} emptyMsg="No morning appointments" />
                <SessionBlock label="Evening" appts={evening} emptyMsg="No evening appointments" />
              </>
            ) : (
              <ListBlock appts={filtered} />
            )
          )}
        </div>
      </div>

      {completeAppt && (
        <CompleteVisitDialog
          appointment={completeAppt}
          onClose={() => setCompleteAppt(null)}
          onDone={() => { setCompleteAppt(null); onRefresh(); }}
          onToast={onToast}
        />
      )}

      {actionsAppt && (
        <AppointmentActionsDialog
          appointment={actionsAppt}
          onClose={() => setActionsAppt(null)}
          onDone={() => { setActionsAppt(null); onRefresh(); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}
