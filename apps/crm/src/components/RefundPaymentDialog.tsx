import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Payment } from '../types';
import { refundPayment } from '../lib/api';
import { useScrollLock } from '../hooks/useScrollLock';

interface Props {
  payment: Payment;
  maxRefundable: number;
  onClose: () => void;
  onSaved: () => void;
  onToast?: (msg: string, type?: 'ok' | 'err') => void;
}

export function RefundPaymentDialog({ payment, maxRefundable, onClose, onSaved, onToast }: Props) {
  const [amount, setAmount] = useState(String(maxRefundable));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useScrollLock(true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0 || value > maxRefundable + 0.001) {
      setError(`Enter up to ₹${maxRefundable}`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await refundPayment(payment.id, {
        amount: value,
        notes: notes.trim() || undefined,
        idempotencyKey: `refund-ui-${payment.id}-${value}`,
      });
      onToast?.('Refund recorded in ledger (not a gateway reversal)', 'ok');
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not record refund';
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
          <h3>Record refund</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form className="modal-form" onSubmit={submit} noValidate>
          <div className="modal-body">
            <p className="muted" style={{ fontSize: '0.875rem' }}>
              This records a cash/bank refund in clinic records. It does not automatically return money via UPI/card gateways.
            </p>
            <div className="form-field">
              <label className="form-label">Original payment</label>
              <div>₹{payment.amount.toLocaleString('en-IN')} · {payment.method}</div>
            </div>
            <div className="form-field">
              <label className="form-label">Refund amount (₹)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                max={maxRefundable}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <span className="muted">Refundable: ₹{maxRefundable.toLocaleString('en-IN')}</span>
            </div>
            <div className="form-field">
              <label className="form-label">Note (optional)</label>
              <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {error && <div className="form-error">{error}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary modal-submit-btn" disabled={loading}>
              {loading ? 'Saving…' : 'Record refund'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
