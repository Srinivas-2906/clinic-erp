import { useState } from 'react';
import { Banknote, X } from 'lucide-react';
import type { Appointment } from '../types';
import { PAYMENT_METHODS } from '../types';
import { recordPayment, updateAppointment } from '../lib/api';
import { useScrollLock } from '../hooks/useScrollLock';

interface Props {
  appointment: Appointment;
  onClose: () => void;
  onDone: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function CompleteVisitDialog({ appointment, onClose, onDone, onToast }: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useScrollLock(true);

  async function complete(withPayment: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      await updateAppointment(appointment.id, { status: 'visited' });
      if (withPayment) {
        const value = Number(amount);
        if (!value || value <= 0) {
          onToast('Enter a valid amount or skip payment', 'err');
          setSaving(false);
          return;
        }
        if (!appointment.patientId) throw new Error('Patient not linked to this booking');
        await recordPayment({
          patientId: appointment.patientId,
          appointmentId: appointment.id,
          amount: value,
          method,
          notes: notes.trim() || undefined,
        });
        onToast(`Visit completed · ₹${value.toLocaleString('en-IN')} recorded`);
      } else {
        onToast(`${appointment.patientName || 'Patient'} visit completed`);
      }
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not complete visit';
      onToast(msg, 'err');
    } finally {
      setSaving(false);
    }
  }

  const name = appointment.patientName || 'Patient';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3>Complete visit</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body complete-visit-body">
          <p className="complete-visit-intro">
            Mark <strong>{name}</strong> as done for <strong>{appointment.service || 'visit'}</strong>.
            Payment is optional but helps you track payments.
          </p>

          <div className="form-field">
            <label className="form-label"><Banknote size={12} /> Amount received (₹)</label>
            <input
              className="form-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              placeholder="e.g. 500 — leave blank to skip"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="form-label">Method</label>
              <select className="form-input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label" style={{ fontWeight: 500 }}>Note <span style={{ color: 'var(--muted)' }}>(optional)</span></label>
              <input
                className="form-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. consultation"
              />
            </div>
          </div>
        </div>

        <div className="modal-footer complete-visit-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => complete(false)} disabled={saving}>
            Skip payment
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => complete(Boolean(amount.trim()))}
            disabled={saving}
          >
            {saving ? 'Saving…' : amount.trim() ? 'Complete & record' : 'Complete visit'}
          </button>
        </div>
      </div>
    </div>
  );
}
