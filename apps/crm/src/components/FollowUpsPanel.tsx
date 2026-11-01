import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';
import type { ClinicFollowUp } from '../types';
import { fetchClinicFollowUps } from '../lib/api';

function fmtDue(d: string) {
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

interface Props {
  onSchedule: (patientId: string, followUpId: string, patientName: string, phone?: string) => void;
  onToast?: (msg: string, type?: 'ok' | 'err') => void;
  refreshKey?: number;
}

export function FollowUpsPanel({ onSchedule, onToast, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<ClinicFollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchClinicFollowUps({ status: 'pending' });
      setItems(data.followUps || []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load follow-ups';
      setError(msg);
      onToast?.(msg, 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="follow-ups-panel follow-ups-panel-loading" role="status">
        Loading follow-ups…
      </div>
    );
  }

  if (error) {
    return (
      <div className="follow-ups-panel follow-ups-panel-error" role="alert">
        {error}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>Retry</button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="follow-ups-panel follow-ups-panel-empty">
        <CalendarClock size={18} />
        <span>No pending follow-ups — doctors can recommend return visits when finalizing a consultation.</span>
      </div>
    );
  }

  return (
    <div className="follow-ups-panel">
      <div className="follow-ups-panel-hd">
        <CalendarClock size={18} />
        <div>
          <p className="follow-ups-panel-title">Follow-ups to schedule</p>
          <p className="follow-ups-panel-sub">{items.length} patient{items.length !== 1 ? 's' : ''} need a return visit</p>
        </div>
      </div>
      <ul className="follow-ups-list">
        {items.map((fu) => (
          <li key={fu.id}>
            <div className="follow-ups-row">
              <div className="follow-ups-row-main">
                <strong>{fu.patientName || 'Patient'}</strong>
                <span className="follow-ups-due">Due {fmtDue(fu.dueDate)}</span>
                {fu.instructions ? <span className="follow-ups-note">{fu.instructions}</span> : null}
                {fu.chiefComplaint ? (
                  <span className="follow-ups-ref">After: {fu.chiefComplaint}</span>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm follow-ups-schedule-btn"
                onClick={() => onSchedule(
                  fu.patientId,
                  fu.id,
                  fu.patientName || 'Patient',
                  fu.patientPhone,
                )}
              >
                Schedule <ChevronRight size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
