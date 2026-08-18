import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Patient, Payment } from '../types';
import { PAYMENT_METHODS } from '../types';
import { recordPayment, updatePayment } from '../lib/api';
import { useScrollLock } from '../hooks/useScrollLock';

interface Props {
  patients: Patient[];
  prefillPatientId?: string;
  payment?: Payment | null;
  onClose: () => void;
  onSaved: () => void;
  onToast?: (msg: string, type?: 'ok' | 'err') => void;
}

export function RecordPaymentDialog({ patients, prefillPatientId, payment, onClose, onSaved, onToast }: Props) {
  const isEdit = Boolean(payment);
  const [patientId, setPatientId] = useState(payment?.patientId || prefillPatientId || '');
  const [amount, setAmount] = useState(payment?.amount != null ? String(payment.amount) : '');
  const [method, setMethod] = useState(payment?.method || PAYMENT_METHODS[0]);
  const [reference, setReference] = useState(payment?.reference || '');
  const [notes, setNotes] = useState(payment?.notes || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useScrollLock(true);

  useEffect(() => {
    if (payment) {
      setPatientId(payment.patientId || '');
      setAmount(payment.amount != null ? String(payment.amount) : '');
      setMethod(payment.method || PAYMENT_METHODS[0]);
      setReference(payment.reference || '');
      setNotes(payment.notes || '');
      return;
    }
    if (prefillPatientId) setPatientId(prefillPatientId);
  }, [prefillPatientId, payment]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) { setError('Select a patient'); return; }
    const value = Number(amount);
    if (!value || value <= 0) { setError('Enter a valid amount'); return; }
    setLoading(true);
    setError('');
    try {
      if (payment) {
        await updatePayment(payment.id, {
          amount: value,
          method,
          reference,
          notes: notes.trim(),
        });
        onToast?.('Payment updated', 'ok');
      } else {
        await recordPayment({
          patientId,
          amount: value,
          method,
          reference,
          notes: notes.trim() || undefined,
        });
        onToast?.('Payment recorded', 'ok');
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : (isEdit ? 'Could not update payment' : 'Could not record payment');
      setError(msg);
      onToast?.(msg, 'err');
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3>{isEdit ? 'Edit payment' : 'Record payment'}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form className="modal-form" onSubmit={submit} noValidate>
          <div className="modal-body">
            <div className="form-field">
              <label className="form-label">Patient</label>
              <select
                className="form-input"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                required
                disabled={Boolean(prefillPatientId) || isEdit}
              >
                <option value="">Select patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.phone}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Amount (₹)</label>
              <input
                className="form-input"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                min="1"
                autoFocus={Boolean(prefillPatientId) || isEdit}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Method</label>
              <select className="form-input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label" style={{ fontWeight: 500 }}>
                Reference <span style={{ color: 'var(--muted)' }}>(optional)</span>
              </label>
              <input className="form-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI txn ID" />
            </div>
            <div className="form-field">
              <label className="form-label" style={{ fontWeight: 500 }}>
                Note <span style={{ color: 'var(--muted)' }}>(optional)</span>
              </label>
              <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. consultation" />
            </div>
            {error && <div className="form-error">{error}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary modal-submit-btn" disabled={loading || !patientId || !amount}>
              {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
