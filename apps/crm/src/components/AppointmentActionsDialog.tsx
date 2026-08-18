import { useEffect, useState } from 'react';
import { CalendarClock, UserX, XCircle, X } from 'lucide-react';
import type { Appointment } from '../types';
import { updateAppointment } from '../lib/api';
import { RescheduleDialog } from './RescheduleDialog';

interface Props {
  appointment: Appointment;
  onClose: () => void;
  onDone: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function AppointmentActionsDialog({ appointment, onClose, onDone, onToast }: Props) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [saving, setSaving] = useState(false);
  const locked = appointment.status === 'visited';

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function setStatus(status: Appointment['status']) {
    if (saving) return;
    setSaving(true);
    try {
      await updateAppointment(appointment.id, { status });
      onToast(status === 'cancelled' ? 'Appointment cancelled' : 'Marked as no-show');
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not update';
      onToast(msg, 'err');
    } finally {
      setSaving(false);
    }
  }

  if (showReschedule) {
    return (
      <RescheduleDialog
        appointment={appointment}
        onClose={() => setShowReschedule(false)}
        onDone={() => { setShowReschedule(false); onDone(); }}
        onToast={onToast}
      />
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3>Appointment actions</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="panel" style={{ padding: 12 }}>
            <p className="muted" style={{ margin: 0 }}>
              {appointment.patientName || 'Patient'} · {new Date(appointment.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>

          <div className="action-grid" style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => setShowReschedule(true)} disabled={saving || locked}>
              <CalendarClock size={14} /> Reschedule
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setStatus('no_show' as Appointment['status'])} disabled={saving || locked}>
              <UserX size={14} /> Mark no-show
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setStatus('cancelled' as Appointment['status'])} disabled={saving || locked}>
              <XCircle size={14} /> Cancel appointment
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost modal-submit-btn" onClick={onClose} disabled={saving}>Close</button>
        </div>
      </div>
    </div>
  );
}

