import { useState } from 'react';
import { Phone, MessageSquare, ChevronRight, Banknote, MoreVertical } from 'lucide-react';
import type { Appointment, AppointmentStatus } from '../types';
import { STATUS_LABELS } from '../types';
import { updateAppointment } from '../lib/api';
import { toTelUrl, toWhatsAppUrl } from '../lib/phone';
import { formatApptDayLabel, formatApptTime, isApptToday } from '../lib/appointmentDisplay';
import { doctorColorFor } from '../lib/doctorDisplay';
import { CompleteVisitDialog } from './CompleteVisitDialog';
import { AppointmentActionsDialog } from './AppointmentActionsDialog';
import { DoctorBadge } from './DoctorBadge';

/* ─── Board column config ─────────────────────────────────────── */
export const BOARD_COLUMNS: {
  statuses: AppointmentStatus[];
  label: string;
  hint: string;
  color: string;
  empty: string;
}[] = [
  { statuses: ['requested'],            label: 'Not confirmed',      hint: 'Need to confirm',     color: '#d97706', empty: 'No one here' },
  { statuses: ['confirmed'],            label: 'Confirmed',          hint: 'Expected today',      color: '#1565C0', empty: 'No one here' },
  { statuses: ['arrived'],              label: 'Arrived',            hint: 'With doctor',         color: '#7c3aed', empty: 'No one here' },
  { statuses: ['visited'],              label: 'Completed',          hint: 'Visit done today',    color: '#16a34a', empty: 'No completed visits yet' },
  { statuses: ['cancelled', 'no_show'], label: 'Cancelled / No show', hint: 'Not coming today',    color: '#64748b', empty: 'Nothing here' },
];

const NEXT: Partial<Record<AppointmentStatus, AppointmentStatus>> = {
  requested: 'confirmed',
  confirmed: 'arrived',
  arrived:   'visited',
};

const ADVANCE_LABEL: Partial<Record<AppointmentStatus, string>> = {
  requested: 'Confirm',
  confirmed: 'Arrived',
  arrived:   'Complete',
};

const PALETTES: [string, string][] = [
  ['#1565C0','#e3f0fd'],['#0369a1','#e0f2fe'],['#7c3aed','#f5f3ff'],
  ['#059669','#ecfdf5'],['#b45309','#fef3c7'],['#be185d','#fce7f3'],['#0f766e','#ccfbf1'],
];
function ava(name: string): [string, string] { return PALETTES[name.charCodeAt(0) % PALETTES.length]; }

function fmtTime(iso: string) {
  return formatApptTime(iso);
}

interface Props {
  appointments: Appointment[];
  showDoctorBadges?: boolean;
  doctorColorById?: Map<string, string>;
  onRefresh: () => void;
  onOpenPatient: (patientId: string) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

function BoardCard({
  appt,
  onAdvance,
  onOpenPatient,
  onActions,
  showDoctorBadges,
  doctorColorById,
}: {
  appt: Appointment;
  onAdvance: (a: Appointment) => void;
  onOpenPatient: (id: string) => void;
  onActions: (a: Appointment) => void;
  showDoctorBadges?: boolean;
  doctorColorById?: Map<string, string>;
}) {
  const name = appt.patientName || 'Patient';
  const [fg, bg] = ava(name);
  const telUrl = toTelUrl(appt.patientPhone);
  const waUrl = toWhatsAppUrl(appt.patientPhone);
  const next = NEXT[appt.status];

  return (
    <div className="board-card">
      <div className="board-card-top">
        <div className="board-card-when">
          {!isApptToday(appt.scheduledAt) && (
            <span className="board-card-day">{formatApptDayLabel(appt.scheduledAt)}</span>
          )}
          <span className="board-card-time">{fmtTime(appt.scheduledAt)}</span>
        </div>
        {appt.source === 'WhatsApp' && <span className="tag tag-wa tag-xs">WA</span>}
        {appt.source === 'Website' && <span className="tag tag-web tag-xs">Web</span>}
      </div>

      <button type="button" className="board-card-patient" onClick={() => onOpenPatient(appt.patientId)}>
        <div className="board-card-ava" style={{ background: bg, color: fg }}>
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="board-card-info">
          <span className="board-card-name">{name}</span>
          <span className="board-card-svc">{appt.service || 'Check-up'}</span>
          <DoctorBadge
            name={appt.assignedDoctor}
            color={doctorColorFor(appt, doctorColorById ?? new Map())}
            compact
            show={showDoctorBadges}
          />
          {appt.paymentAmount != null && appt.paymentAmount > 0 && (
            <span className="board-card-payment">
              <Banknote size={10} /> ₹{appt.paymentAmount.toLocaleString('en-IN')}
              {appt.paymentMethod ? ` · ${appt.paymentMethod}` : ''}
            </span>
          )}
        </div>
        <ChevronRight size={14} className="board-card-chevron" />
      </button>

      {(telUrl || waUrl || next) && (
        <div className="board-card-foot">
          {(telUrl || waUrl) && (
            <div className="board-card-contact">
              {telUrl && (
                <a href={telUrl} className="quick-action-btn" title="Call" onClick={(e) => e.stopPropagation()}>
                  <Phone size={12} />
                </a>
              )}
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noreferrer" className="quick-action-btn quick-action-wa" title="WhatsApp" onClick={(e) => e.stopPropagation()}>
                  <MessageSquare size={12} />
                </a>
              )}
            </div>
          )}
          <button type="button" className="quick-action-btn" title="Actions" onClick={() => onActions(appt)}>
            <MoreVertical size={14} />
          </button>
          {next && (
            <button type="button" className="board-card-advance" onClick={() => onAdvance(appt)}>
              {ADVANCE_LABEL[appt.status]}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function AppointmentBoard({
  appointments,
  showDoctorBadges,
  doctorColorById,
  onRefresh,
  onOpenPatient,
  onToast,
}: Props) {
  const [completeAppt, setCompleteAppt] = useState<Appointment | null>(null);
  const [actionsAppt, setActionsAppt] = useState<Appointment | null>(null);

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
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save';
      onToast(msg.includes('clinic-api') || msg.includes('API') ? msg : 'Could not save — is clinic-api running on port 3010?', 'err');
    }
  }

  return (
    <div className="board-wrap">
      <p className="board-hint">
        Tap the button on each card to move the patient to the next step.
      </p>

      <div className="board-scroll">
        {BOARD_COLUMNS.map((col) => {
          const colAppts = appointments
            .filter((a) => col.statuses.includes(a.status))
            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

          return (
            <div key={col.label} className="board-col">
              <div className="board-col-head" style={{ borderTopColor: col.color }}>
                <div className="board-col-title">
                  <span className="board-col-dot" style={{ background: col.color }} />
                  <span style={{ color: col.color }}>{col.label}</span>
                </div>
                <span className="board-col-count">{colAppts.length}</span>
              </div>
              <p className="board-col-hint">{col.hint}</p>

              <div className="board-col-cards">
                {colAppts.length === 0 ? (
                  <div className="board-col-empty">{col.empty}</div>
                ) : (
                  colAppts.map((appt) => (
                    <BoardCard
                      key={appt.id}
                      appt={appt}
                      onAdvance={advance}
                      onOpenPatient={onOpenPatient}
                      onActions={(a) => setActionsAppt(a)}
                      showDoctorBadges={showDoctorBadges}
                      doctorColorById={doctorColorById}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
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
