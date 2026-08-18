import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  DAY_NAMES,
  DAY_ORDER,
  type DaySchedule,
  daySchedulesToSessions,
  sessionsToDaySchedules,
  standardClinicDaySchedules,
  validateScheduleDraft,
} from '../lib/scheduleUtils';
import { useDoctorSessions, useSaveDoctorSessions } from '../hooks/useDoctors';

interface Props {
  doctorId: string;
  defaultSlotDuration?: number;
  onToast: (text: string, type?: 'ok' | 'err') => void;
}

export function DoctorScheduleEditor({ doctorId, defaultSlotDuration = 30, onToast }: Props) {
  const { data: sessions = [], isLoading } = useDoctorSessions(doctorId, true);
  const saveMutation = useSaveDoctorSessions();
  const [days, setDays] = useState<DaySchedule[]>(() => standardClinicDaySchedules(defaultSlotDuration));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoading) return;
    setDays(sessionsToDaySchedules(sessions, defaultSlotDuration));
    setDirty(false);
    setError('');
  }, [sessions, isLoading, defaultSlotDuration]);

  function updateDay(dow: number, patch: Partial<DaySchedule>) {
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d)));
    setDirty(true);
    setError('');
  }

  function updateBlock(dow: number, blockIdx: number, patch: Partial<DaySchedule['blocks'][0]>) {
    setDays((prev) => prev.map((d) => {
      if (d.dayOfWeek !== dow) return d;
      const blocks = d.blocks.map((b, i) => (i === blockIdx ? { ...b, ...patch } : b));
      return { ...d, blocks };
    }));
    setDirty(true);
    setError('');
  }

  function addBlock(dow: number) {
    setDays((prev) => prev.map((d) => {
      if (d.dayOfWeek !== dow) return d;
      return {
        ...d,
        enabled: true,
        blocks: [...d.blocks, { startTime: '17:00', endTime: '20:00', slotDurationMinutes: defaultSlotDuration }],
      };
    }));
    setDirty(true);
  }

  function removeBlock(dow: number, blockIdx: number) {
    setDays((prev) => prev.map((d) => {
      if (d.dayOfWeek !== dow) return d;
      const blocks = d.blocks.filter((_, i) => i !== blockIdx);
      return { ...d, blocks: blocks.length ? blocks : [{ startTime: '10:00', endTime: '15:00', slotDurationMinutes: defaultSlotDuration }] };
    }));
    setDirty(true);
  }

  function applyStandard() {
    setDays(standardClinicDaySchedules(defaultSlotDuration));
    setDirty(true);
    setError('');
  }

  async function handleSave() {
    const validationError = validateScheduleDraft(days);
    if (validationError) {
      setError(validationError);
      return;
    }
    const payload = daySchedulesToSessions(days);
    try {
      await saveMutation.mutateAsync({ doctorId, sessions: payload });
      onToast('Schedule saved');
      setDirty(false);
      setError('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save schedule';
      setError(msg);
      onToast(msg, 'err');
    }
  }

  if (isLoading) {
    return <p className="doctor-panel-muted">Loading schedule…</p>;
  }

  return (
    <div className="doctor-schedule-editor">
      <div className="doctor-schedule-toolbar">
        <button type="button" className="btn-secondary btn-sm" onClick={applyStandard}>
          Use standard hours
        </button>
        {dirty && (
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => void handleSave()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save schedule'}
          </button>
        )}
      </div>

      {error && <div className="form-error doctor-schedule-error">{error}</div>}

      <div className="doctor-schedule-days">
        {DAY_ORDER.map((dow) => {
          const day = days.find((d) => d.dayOfWeek === dow)!;
          return (
            <div key={dow} className={`doctor-schedule-day${day.enabled ? '' : ' is-off'}`}>
              <div className="doctor-schedule-day-head">
                <label className="doctor-day-toggle">
                  <input
                    type="checkbox"
                    checked={day.enabled}
                    onChange={(e) => updateDay(dow, { enabled: e.target.checked })}
                  />
                  <span>{DAY_NAMES[dow]}</span>
                </label>
                {day.enabled && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => addBlock(dow)}>
                    <Plus size={14} /> Block
                  </button>
                )}
              </div>

              {day.enabled && day.blocks.map((block, blockIdx) => (
                <div key={blockIdx} className="doctor-schedule-block">
                  <input
                    type="time"
                    className="form-input schedule-time-input"
                    value={block.startTime}
                    onChange={(e) => updateBlock(dow, blockIdx, { startTime: e.target.value })}
                    aria-label={`${DAY_NAMES[dow]} start`}
                  />
                  <span className="doctor-schedule-sep">to</span>
                  <input
                    type="time"
                    className="form-input schedule-time-input"
                    value={block.endTime}
                    onChange={(e) => updateBlock(dow, blockIdx, { endTime: e.target.value })}
                    aria-label={`${DAY_NAMES[dow]} end`}
                  />
                  <select
                    className="form-input form-select schedule-slot-select"
                    value={block.slotDurationMinutes}
                    onChange={(e) => updateBlock(dow, blockIdx, { slotDurationMinutes: Number(e.target.value) })}
                    aria-label={`${DAY_NAMES[dow]} slot duration`}
                  >
                    {[15, 20, 30, 45, 60].map((n) => (
                      <option key={n} value={n}>{n} min</option>
                    ))}
                  </select>
                  {day.blocks.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn schedule-remove-btn"
                      onClick={() => removeBlock(dow, blockIdx)}
                      aria-label="Remove block"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
