import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, CalendarDays, User, Clock, ChevronRight, Sparkles } from 'lucide-react';
import type { Appointment, AppointmentStatus } from '../types';
import { STATUS_LABELS } from '../types';
import { fetchPatients } from '../lib/api';
import { useVisualViewportAnchor } from '../hooks/useVisualViewportAnchor';

interface Props {
  todayAppointments: Appointment[];
  onClose: () => void;
  onOpenPatient: (id: string) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
  onGoToToday: () => void;
}

type TodayFilter = 'all' | 'requested' | 'confirmed' | 'arrived';

const PALETTES: [string, string][] = [
  ['#1565C0', '#e3f0fd'], ['#0369a1', '#e0f2fe'], ['#7c3aed', '#f5f3ff'],
  ['#059669', '#ecfdf5'], ['#b45309', '#fef3c7'], ['#be185d', '#fce7f3'], ['#0f766e', '#ccfbf1'],
];

const TAG_CLASS: Record<AppointmentStatus, string> = {
  requested: 'tag tag-warning',
  confirmed: 'tag tag-brand',
  arrived: 'tag tag-purple',
  visited: 'tag tag-success',
  cancelled: 'tag tag-muted',
  no_show: 'tag tag-muted',
};

const TODAY_FILTERS: { id: TodayFilter; label: string; tone: string }[] = [
  { id: 'all', label: 'All', tone: 'purple' },
  { id: 'requested', label: 'Need confirm', tone: 'amber' },
  { id: 'confirmed', label: 'Confirmed', tone: 'blue' },
  { id: 'arrived', label: 'Arrived', tone: 'green' },
];

function ava(name: string): [string, string] {
  return PALETTES[name.charCodeAt(0) % PALETTES.length];
}

function fmtPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return phone;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function todayLabel() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

export function GlobalSearchDialog({ todayAppointments, onClose, onOpenPatient, onToast, onGoToToday }: Props) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState<PatientLite[]>([]);
  const [todayFilter, setTodayFilter] = useState<TodayFilter>('all');
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useVisualViewportAnchor(overlayRef);

  useEffect(() => {
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (!query) { setPatients([]); return; }
    const t = setTimeout(() => {
      setLoading(true);
      fetchPatients(query)
        .then((res) => setPatients(res || []))
        .catch(() => setPatients([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const sortedToday = useMemo(
    () => [...todayAppointments].sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    ),
    [todayAppointments],
  );

  const todayCounts = useMemo(() => ({
    all: sortedToday.length,
    requested: sortedToday.filter((a) => a.status === 'requested').length,
    confirmed: sortedToday.filter((a) => a.status === 'confirmed').length,
    arrived: sortedToday.filter((a) => a.status === 'arrived').length,
  }), [sortedToday]);

  const filteredToday = useMemo(() => {
    if (todayFilter === 'all') return sortedToday;
    return sortedToday.filter((a) => a.status === todayFilter);
  }, [sortedToday, todayFilter]);

  const apptMatches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return sortedToday.filter((a) => {
      const name = (a.patientName || '').toLowerCase();
      const phone = (a.patientPhone || '').replace(/\D/g, '');
      const service = (a.service || '').toLowerCase();
      return name.includes(query) || phone.includes(query.replace(/\D/g, '')) || service.includes(query);
    }).slice(0, 8);
  }, [q, sortedToday]);

  const searching = !!q.trim();

  function openPatientFromAppt(appt: Appointment) {
    if (!appt.patientId) {
      onToast('This booking is not linked to a patient', 'err');
      return;
    }
    onOpenPatient(appt.patientId);
    onClose();
  }

  function renderApptRow(appt: Appointment) {
    const name = appt.patientName || 'Patient';
    const [fg, bg] = ava(name);
    return (
      <li key={appt.id}>
        <button type="button" className="search-result-row" onClick={() => openPatientFromAppt(appt)}>
          <div className="search-result-ava" style={{ background: bg, color: fg }}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="search-result-main">
            <div className="search-result-title">{name}</div>
            <div className="search-result-sub">
              {fmtTime(appt.scheduledAt)} · {appt.service || 'Check-up'}
            </div>
            <span className={TAG_CLASS[appt.status]}>{STATUS_LABELS[appt.status]}</span>
          </div>
          <ChevronRight size={16} className="search-result-chevron" />
        </button>
      </li>
    );
  }

  function renderPatientRow(p: PatientLite) {
    const [fg, bg] = ava(p.name);
    return (
      <li key={p.id}>
        <button type="button" className="search-result-row" onClick={() => { onOpenPatient(p.id); onClose(); }}>
          <div className="search-result-ava" style={{ background: bg, color: fg }}>
            {p.name.charAt(0).toUpperCase()}
          </div>
          <div className="search-result-main">
            <div className="search-result-title">{p.name}</div>
            <div className="search-result-sub">
              {fmtPhone(p.phone)}{p.chiefComplaint ? ` · ${p.chiefComplaint}` : ''}
            </div>
          </div>
          <ChevronRight size={16} className="search-result-chevron" />
        </button>
      </li>
    );
  }

  return (
    <div className="modal-overlay search-overlay" ref={overlayRef} onClick={onClose}>
      <div className="modal-sheet search-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="search-sheet-brand">
          <div className="search-sheet-brand-icon">
            <Sparkles size={18} />
          </div>
          <div className="search-sheet-brand-text">
            <h2>Search</h2>
            <p>{todayLabel()} · {sortedToday.length} appointment{sortedToday.length !== 1 ? 's' : ''} today</p>
          </div>
          <button type="button" className="modal-close search-sheet-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="search-sheet-head">
          <div className="search-wrap search-sheet-input">
            <span className="search-icon"><Search size={15} /></span>
            <input
              ref={inputRef}
              type="search"
              className="search-input search-input-prominent"
              placeholder="Name or phone"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              enterKeyHint="search"
            />
          </div>
        </div>

        <div className="modal-body search-sheet-body">
          {!searching ? (
            <>
              <div className="search-section-label">
                <CalendarDays size={14} />
                <span>Today</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onGoToToday(); onClose(); }}>
                  Open
                </button>
              </div>

              <div className="search-today-filters" role="toolbar" aria-label="Filter today">
                {TODAY_FILTERS.map(({ id, label, tone }) => (
                  <button
                    key={id}
                    type="button"
                    className={`header-stat-chip ${tone}${todayFilter === id ? ' active' : ''}`}
                    onClick={() => setTodayFilter(id)}
                    aria-pressed={todayFilter === id}
                  >
                    <strong>{todayCounts[id]}</strong> {label}
                  </button>
                ))}
              </div>

              {filteredToday.length === 0 ? (
                <div className="search-empty-today">
                  <Clock size={22} strokeWidth={1.5} />
                  <p>No appointments in this group.</p>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTodayFilter('all')}>
                    Show all today
                  </button>
                </div>
              ) : (
                <ul className="search-result-list">
                  {filteredToday.slice(0, 10).map(renderApptRow)}
                </ul>
              )}

              <p className="search-sheet-footnote">
                Type to search <strong>all patients</strong>.
              </p>
            </>
          ) : (
            <>
              <p className="search-status-line">
                {loading ? 'Searching…' : (
                  <>
                    {apptMatches.length > 0 && `${apptMatches.length} today`}
                    {apptMatches.length > 0 && patients.length > 0 && ' · '}
                    {patients.length > 0 && `${patients.length} patient${patients.length !== 1 ? 's' : ''}`}
                    {!loading && apptMatches.length === 0 && patients.length === 0 && 'No match. Try name or phone'}
                  </>
                )}
              </p>

              {apptMatches.length > 0 && (
                <>
                  <div className="search-section-label">
                    <CalendarDays size={14} />
                    <span>Today</span>
                  </div>
                  <ul className="search-result-list">{apptMatches.map(renderApptRow)}</ul>
                </>
              )}

              {patients.length > 0 && (
                <>
                  <div className="search-section-label">
                    <User size={14} />
                    <span>All patients</span>
                  </div>
                  <ul className="search-result-list">{patients.slice(0, 8).map(renderPatientRow)}</ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type PatientLite = {
  id: string;
  name: string;
  phone: string;
  chiefComplaint?: string;
};
