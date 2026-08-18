import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useCreateDoctorTimeOff, useDeleteDoctorTimeOff, useDoctorTimeOff } from '../hooks/useDoctors';

interface Props {
  doctorId: string;
  onToast: (text: string, type?: 'ok' | 'err') => void;
}

function toDatetimeLocalValue(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTimeOffRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${start} – ${end}`;
  const sameDay = s.toDateString() === e.toDateString();
  const dateFmt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  if (sameDay) {
    return `${s.toLocaleDateString('en-IN', dateFmt)}, ${s.toLocaleTimeString('en-IN', timeFmt)} – ${e.toLocaleTimeString('en-IN', timeFmt)}`;
  }
  return `${s.toLocaleString('en-IN', { ...dateFmt, ...timeFmt })} – ${e.toLocaleString('en-IN', { ...dateFmt, ...timeFmt })}`;
}

export function DoctorTimeOffPanel({ doctorId, onToast }: Props) {
  const { data: timeOff = [], isLoading } = useDoctorTimeOff(doctorId, true);
  const createMutation = useCreateDoctorTimeOff();
  const deleteMutation = useDeleteDoctorTimeOff();
  const [showForm, setShowForm] = useState(false);
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!startLocal || !endLocal) {
      setError('Start and end required');
      return;
    }
    const startDatetime = new Date(startLocal).toISOString();
    const endDatetime = new Date(endLocal).toISOString();
    if (endDatetime <= startDatetime) {
      setError('End must be after start');
      return;
    }
    setError('');
    try {
      await createMutation.mutateAsync({
        doctorId,
        data: { startDatetime, endDatetime, reason: reason.trim() },
      });
      onToast('Time off added');
      setShowForm(false);
      setStartLocal('');
      setEndLocal('');
      setReason('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add time off';
      setError(msg);
      onToast(msg, 'err');
    }
  }

  async function handleDelete(offId: string) {
    try {
      await deleteMutation.mutateAsync({ doctorId, offId });
      onToast('Time off removed');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not remove', 'err');
    }
  }

  return (
    <div className="doctor-timeoff-panel">
      {isLoading ? (
        <p className="doctor-panel-muted">Loading time off…</p>
      ) : timeOff.length === 0 && !showForm ? (
        <p className="doctor-panel-muted">No leave or blocked time scheduled.</p>
      ) : (
        <ul className="doctor-timeoff-list">
          {timeOff.map((block) => (
            <li key={block.id} className="doctor-timeoff-item">
              <div>
                <div className="doctor-timeoff-range">{formatTimeOffRange(block.startDatetime, block.endDatetime)}</div>
                {block.reason && <div className="doctor-timeoff-reason">{block.reason}</div>}
              </div>
              <button
                type="button"
                className="icon-btn schedule-remove-btn"
                onClick={() => void handleDelete(block.id)}
                disabled={deleteMutation.isPending}
                aria-label="Remove time off"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <form className="doctor-timeoff-form" onSubmit={(e) => void handleAdd(e)}>
          {error && <div className="form-error">{error}</div>}
          <div className="form-row">
            <div className="form-field">
              <label className="form-label">From</label>
              <input
                type="datetime-local"
                className="form-input"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label className="form-label">To</label>
              <input
                type="datetime-local"
                className="form-input"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="form-field">
            <label className="form-label">Reason (optional)</label>
            <input
              className="form-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Leave, conference, etc."
            />
          </div>
          <div className="doctor-timeoff-form-actions">
            <button type="button" className="btn-secondary btn-sm" onClick={() => { setShowForm(false); setError(''); }}>
              Cancel
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving…' : 'Add time off'}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-secondary btn-sm" onClick={() => setShowForm(true)}>
          <Plus size={14} /> Add time off
        </button>
      )}
    </div>
  );
}

export { toDatetimeLocalValue };
