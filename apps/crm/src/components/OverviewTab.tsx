import { CalendarCheck, AlertCircle, Phone, MessageSquare, CalendarPlus, Activity, ChevronRight, Banknote, MoreVertical } from 'lucide-react';
import type { Appointment, AppointmentStatus, TodayStats } from '../types';
import { STATUS_LABELS } from '../types';
import { updateAppointment } from '../lib/api';
import { toTelUrl, toWhatsAppUrl } from '../lib/phone';
import { formatApptDayLabel, formatApptTime, isApptToday } from '../lib/appointmentDisplay';
import { buildDoctorColorMap, doctorColorFor } from '../lib/doctorDisplay';
import { countAppointmentsByDoctor } from '../lib/todayStats';
import { useDoctors } from '../hooks/useDoctors';
import { CompleteVisitDialog } from './CompleteVisitDialog';
import { ConsultationDialog } from './ConsultationDialog';
import { AppointmentActionsDialog } from './AppointmentActionsDialog';
import { DoctorFilterChips } from './DoctorFilterChips';
import { DoctorBadge } from './DoctorBadge';
import { useMemo, useState } from 'react';

const PALETTES: [string, string][] = [
  ['#1565C0','#e3f0fd'],['#0369a1','#e0f2fe'],['#7c3aed','#f5f3ff'],
  ['#059669','#ecfdf5'],['#b45309','#fef3c7'],['#be185d','#fce7f3'],['#0f766e','#ccfbf1'],
];
function ava(name: string): [string, string] { return PALETTES[name.charCodeAt(0) % PALETTES.length]; }

const TAG_CLASS: Record<AppointmentStatus, string> = {
  requested:'tag tag-warning', confirmed:'tag tag-brand', arrived:'tag tag-purple',
  visited:'tag tag-success',   cancelled:'tag tag-muted', no_show:'tag tag-muted',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtTime(iso: string) {
  return formatApptTime(iso);
}

function todayDate() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

interface Props {
  today: TodayStats | null;
  rawToday: TodayStats | null;
  doctorFilter: string | null;
  onDoctorFilterChange: (doctorId: string | null) => void;
  displayName?: string;
  onGoToToday: () => void;
  onGoToBook: () => void;
  onOpenPatient: (id: string) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
  onRefresh: () => void;
  canRecordPayments?: boolean;
  onConsultationFinalized?: (appointment: Appointment, encounterId: string) => void;
  onOpenVisitBilling?: (appointment: Appointment, encounterId?: string | null) => void;
  outstandingBalance?: number;
  openInvoiceCount?: number;
  onGoToPayments?: () => void;
}

export function OverviewTab({
  today,
  rawToday,
  doctorFilter,
  onDoctorFilterChange,
  displayName,
  onGoToToday,
  onGoToBook,
  onOpenPatient,
  onToast,
  onRefresh,
  canRecordPayments = true,
  onConsultationFinalized,
  onOpenVisitBilling,
  outstandingBalance = 0,
  openInvoiceCount = 0,
  onGoToPayments,
}: Props) {
  const [completeAppt, setCompleteAppt] = useState<Appointment | null>(null);
  const [consultAppt, setConsultAppt] = useState<Appointment | null>(null);
  const [actionsAppt, setActionsAppt] = useState<Appointment | null>(null);
  const { data: doctorsList = [] } = useDoctors(false);
  const activeDoctors = useMemo(
    () => doctorsList.filter((d) => d.isActive !== false),
    [doctorsList],
  );
  const multiDoctor = activeDoctors.length > 1;
  const doctorColorById = useMemo(() => buildDoctorColorMap(activeDoctors), [activeDoctors]);
  const doctorCounts = useMemo(
    () => countAppointmentsByDoctor((rawToday?.appointments ?? []).filter((a) => isApptToday(a.scheduledAt))),
    [rawToday?.appointments],
  );
  const appts = today?.appointments ?? [];
  const upcomingLater = today?.upcomingLater ?? today?.pendingRequests ?? [];
  const pendingLater = upcomingLater.filter((a) => a.status === 'requested');
  const unconfirmedToday = today?.unconfirmedToday ?? appts.filter((a) => a.status === 'requested').length;
  const todayActive = useMemo(
    () => [...appts]
      .filter((a) => isApptToday(a.scheduledAt))
      .filter((a) => a.status !== 'visited' && a.status !== 'cancelled' && a.status !== 'no_show')
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [appts],
  );
  const arrivedQueue = useMemo(() => todayActive.filter((a) => a.status === 'arrived'), [todayActive]);
  const nextUp = useMemo(() => todayActive.filter((a) => a.status !== 'arrived').slice(0, 5), [todayActive]);
  const nextUpHidden = Math.max(0, todayActive.filter((a) => a.status !== 'arrived').length - nextUp.length);

  const confirmBanner =
    unconfirmedToday + pendingLater.length > 0
      ? unconfirmedToday > 0 && pendingLater.length > 0
        ? `${unconfirmedToday + pendingLater.length} bookings need confirmation — ${unconfirmedToday} today, ${pendingLater.length} later`
        : unconfirmedToday > 0
          ? `${unconfirmedToday} booking${unconfirmedToday !== 1 ? 's' : ''} need confirmation today`
          : `${pendingLater.length} online booking${pendingLater.length !== 1 ? 's' : ''} for later days need confirmation`
      : '';

  async function advance(appt: Appointment, next: AppointmentStatus) {
    if (next === 'visited') {
      setCompleteAppt(appt);
      return;
    }
    try {
      await updateAppointment(appt.id, { status: next });
      onRefresh();
      onToast(next === 'confirmed' ? `${appt.patientName} confirmed` : `${appt.patientName} is now ${STATUS_LABELS[next].toLowerCase()}`);
    } catch { onToast('Could not save', 'err'); }
  }

  return (
    <div className="view overview-view">
      {/* Greeting */}
      <div className="overview-greeting">
        <div>
          <h1 className="overview-greeting-title">{greeting()}{displayName ? `, ${displayName}` : ''}</h1>
          <p className="overview-greeting-sub">{todayDate()}</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onGoToBook} style={{ flexShrink: 0 }}>
          <CalendarPlus size={13} /> Book
        </button>
      </div>

      <DoctorFilterChips
        doctors={activeDoctors}
        value={doctorFilter}
        onChange={onDoctorFilterChange}
        counts={doctorCounts}
        totalCount={(rawToday?.appointments ?? []).filter((a) => isApptToday(a.scheduledAt)).length}
      />

      {confirmBanner && (
        <div className="alert-banner alert-banner-static">
          <span className="alert-banner-icon"><AlertCircle size={16} /></span>
          <span className="alert-banner-text">
            <strong>{confirmBanner}</strong>
            <span> — call or WhatsApp the patient</span>
          </span>
        </div>
      )}

      {/* Stats grid — today only; later requests have their own section below */}
      <div className="stat-strip stat-strip-3">
        <div className="stat-card">
          <div className="stat-icon blue"><CalendarCheck size={16} /></div>
          <div className="stat-val">{today?.total ?? 0}</div>
          <div className="stat-lbl">Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber"><Activity size={16} /></div>
          <div className="stat-val">{unconfirmedToday}</div>
          <div className="stat-lbl">Need confirm</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="stat-val">{today?.arrived ?? 0}</div>
          <div className="stat-lbl">Arrived now</div>
        </div>
      </div>

      {canRecordPayments && outstandingBalance > 0 && onGoToPayments && (
        <div className="overview-billing-alert" role="status">
          <Banknote size={18} />
          <div>
            <strong>₹{outstandingBalance.toLocaleString('en-IN')} outstanding</strong>
            <span>{openInvoiceCount} open invoice{openInvoiceCount !== 1 ? 's' : ''} · collect at front desk</span>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={onGoToPayments}>
            Collect
          </button>
        </div>
      )}

      {/* Arrived — always show full queue (usually small) */}
      {arrivedQueue.length > 0 && (
        <div className="overview-section">
          <div className="section-hd">
            <div>
              <p className="section-hd-title">In clinic — ready for doctor</p>
              <p className="section-hd-sub">{arrivedQueue.length} arrived · needs consultation</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onGoToToday}>
              Today queue <ChevronRight size={12} />
            </button>
          </div>
          <div className="panel" style={{ overflow: 'hidden' }}>
            {arrivedQueue.map((appt) => {
              const name = appt.patientName || 'Patient';
              const [fg, bg] = ava(name);
              return (
                <div key={appt.id} className="overview-appt-row overview-appt-row-arrived">
                  <span className="overview-appt-time">{fmtTime(appt.scheduledAt)}</span>
                  <div className="overview-appt-ava" style={{ background: bg, color: fg }}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="overview-appt-info">
                    <button type="button" className="overview-appt-name" onClick={() => onOpenPatient(appt.patientId)}>
                      {name}
                    </button>
                    <span className="overview-appt-svc">{appt.service || 'Check-up'}</span>
                  </div>
                  <span className={TAG_CLASS.arrived}>{STATUS_LABELS.arrived}</span>
                  <div className="overview-appt-actions">
                    <button type="button" className="action-btn action-done" onClick={() => setConsultAppt(appt)}>
                      Consult
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Today's queue */}
      <div className="overview-section">
        <div className="section-hd">
          <div>
            <p className="section-hd-title">Next up today</p>
            <p className="section-hd-sub">
              {nextUp.length} shown
              {nextUpHidden > 0 ? ` · ${nextUpHidden} more on Today` : ''}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onGoToToday}>
            See all <ChevronRight size={12} />
          </button>
        </div>

        {nextUp.length === 0 && arrivedQueue.length === 0 ? (
          <div className="overview-empty-row">
            <CalendarCheck size={18} color="var(--muted)" />
            <span>No one booked for later today.</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={onGoToBook}>Book now</button>
          </div>
        ) : (
          <div className="panel" style={{ overflow: 'hidden' }}>
            {nextUp.map((appt) => {
              const name = appt.patientName || 'Patient';
              const [fg, bg] = ava(name);
              const telUrl = toTelUrl(appt.patientPhone);
              const waUrl = toWhatsAppUrl(appt.patientPhone);
              return (
                <div key={appt.id} className="overview-appt-row">
                  <span className="overview-appt-time">{fmtTime(appt.scheduledAt)}</span>
                  <div className="overview-appt-ava" style={{ background: bg, color: fg }}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="overview-appt-info">
                    <button type="button" className="overview-appt-name" onClick={() => onOpenPatient(appt.patientId)}>
                      {name}
                    </button>
                    <span className="overview-appt-svc">{appt.service || 'Check-up'}</span>
                    <DoctorBadge
                      name={appt.assignedDoctor}
                      color={doctorColorFor(appt, doctorColorById)}
                      compact
                      show={multiDoctor}
                    />
                    {appt.paymentAmount != null && appt.paymentAmount > 0 && (
                      <span className="board-card-payment" style={{ marginTop: 2 }}>
                        <Banknote size={10} /> ₹{appt.paymentAmount.toLocaleString('en-IN')}
                        {appt.paymentMethod ? ` · ${appt.paymentMethod}` : ''}
                      </span>
                    )}
                  </div>
                  <span className={TAG_CLASS[appt.status]}>{STATUS_LABELS[appt.status]}</span>
                  <div className="overview-appt-actions">
                    {telUrl && (
                      <a href={telUrl} className="quick-action-btn" title="Call patient">
                        <Phone size={13} />
                      </a>
                    )}
                    {waUrl && (
                      <a href={waUrl} target="_blank" rel="noreferrer" className="quick-action-btn quick-action-wa" title="WhatsApp">
                        <MessageSquare size={13} />
                      </a>
                    )}
                    {appt.status === 'requested' && (
                      <button type="button" className="action-btn action-confirm" onClick={() => advance(appt, 'confirmed')}>
                        Confirm
                      </button>
                    )}
                    {appt.status === 'confirmed' && (
                      <button type="button" className="action-btn action-arrived" onClick={() => advance(appt, 'arrived')}>
                        Arrived
                      </button>
                    )}
                    {appt.status === 'arrived' && (
                      <button type="button" className="action-btn action-done" onClick={() => setConsultAppt(appt)}>
                        Consult
                      </button>
                    )}
                    <button type="button" className="quick-action-btn" title="More actions" onClick={() => setActionsAppt(appt)}>
                      <MoreVertical size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {upcomingLater.length > 0 && (
        <div className="overview-section">
          <div className="section-hd">
            <div>
              <p className="section-hd-title">Coming up later</p>
              <p className="section-hd-sub">
                {upcomingLater.length} on other day{upcomingLater.length !== 1 ? 's' : ''}
                {pendingLater.length > 0 && pendingLater.length < upcomingLater.length
                  ? ` · ${pendingLater.length} need confirm`
                  : ''}
              </p>
            </div>
          </div>
          <div className="panel" style={{ overflow: 'hidden' }}>
            {upcomingLater.map((appt) => {
              const name = appt.patientName || 'Patient';
              const [fg, bg] = ava(name);
              const telUrl = toTelUrl(appt.patientPhone);
              const waUrl = toWhatsAppUrl(appt.patientPhone);
              return (
                <div key={appt.id} className="overview-appt-row overview-appt-row-future">
                  <div className="overview-appt-when">
                    <span className="overview-appt-day">{formatApptDayLabel(appt.scheduledAt)}</span>
                    <span className="overview-appt-time">{fmtTime(appt.scheduledAt)}</span>
                  </div>
                  <div className="overview-appt-ava" style={{ background: bg, color: fg }}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="overview-appt-info">
                    <button type="button" className="overview-appt-name" onClick={() => onOpenPatient(appt.patientId)}>
                      {name}
                    </button>
                    <span className="overview-appt-svc">{appt.service || 'Check-up'}</span>
                    <DoctorBadge
                      name={appt.assignedDoctor}
                      color={doctorColorFor(appt, doctorColorById)}
                      compact
                      show={multiDoctor}
                    />
                  </div>
                  <span className={TAG_CLASS[appt.status]}>{STATUS_LABELS[appt.status]}</span>
                  <div className="overview-appt-actions">
                    {telUrl && (
                      <a href={telUrl} className="quick-action-btn" title="Call patient">
                        <Phone size={13} />
                      </a>
                    )}
                    {waUrl && (
                      <a href={waUrl} target="_blank" rel="noreferrer" className="quick-action-btn quick-action-wa" title="WhatsApp">
                        <MessageSquare size={13} />
                      </a>
                    )}
                    {appt.status === 'requested' && (
                      <button type="button" className="action-btn action-confirm" onClick={() => advance(appt, 'confirmed')}>
                        Confirm
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="overview-section">
        <p className="section-hd-title" style={{ marginBottom: 12 }}>Shortcuts</p>
        <div className="quick-cards-grid">
          <button type="button" className="quick-card" onClick={onGoToBook}>
            <div className="quick-card-icon blue"><CalendarPlus size={20} /></div>
            <span className="quick-card-label">Book</span>
            <span className="quick-card-sub">Walk-in or phone</span>
          </button>
          <button type="button" className="quick-card" onClick={onGoToToday}>
            <div className="quick-card-icon green"><CalendarCheck size={20} /></div>
            <span className="quick-card-label">Today</span>
            <span className="quick-card-sub">See all appointments</span>
          </button>
        </div>
      </div>

      {consultAppt && (
        <ConsultationDialog
          appointment={consultAppt}
          onClose={() => { setConsultAppt(null); onRefresh(); }}
          onDone={() => { setConsultAppt(null); onRefresh(); }}
          onConsultationFinalized={(appt, encounterId) => onConsultationFinalized?.(appt, encounterId)}
          onToast={onToast}
        />
      )}

      {completeAppt && (
        <CompleteVisitDialog
          appointment={completeAppt}
          onClose={() => setCompleteAppt(null)}
          onDone={() => { setCompleteAppt(null); onRefresh(); }}
          onToast={onToast}
          canRecordPayments={canRecordPayments}
        />
      )}

      {actionsAppt && (
        <AppointmentActionsDialog
          appointment={actionsAppt}
          onClose={() => setActionsAppt(null)}
          onDone={() => { setActionsAppt(null); onRefresh(); }}
          onToast={onToast}
          allowCompleteWithoutConsult={actionsAppt.status === 'arrived'}
          onCompleteWithoutConsult={() => {
            const appt = actionsAppt;
            setActionsAppt(null);
            setCompleteAppt(appt);
          }}
          canOpenBilling={actionsAppt.status === 'visited' && canRecordPayments && Boolean(onOpenVisitBilling)}
          onOpenBilling={() => {
            const appt = actionsAppt;
            setActionsAppt(null);
            onOpenVisitBilling?.(appt);
          }}
        />
      )}
    </div>
  );
}
