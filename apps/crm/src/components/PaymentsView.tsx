import { useState } from 'react';
import { Banknote, ChevronRight, Pencil, Share2 } from 'lucide-react';
import type { Payment, PaymentSummary, Patient } from '../types';
import type { ClinicProfile } from '../lib/clinicBranding';
import { RecordPaymentDialog } from './RecordPaymentDialog';
import { SharePaymentDialog } from './SharePaymentDialog';

function formatRs(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

interface Props {
  summary: PaymentSummary;
  payments: Payment[];
  patients: Patient[];
  clinicProfile: ClinicProfile;
  onRecorded: () => void;
  onOpenPatient: (patientId: string) => void;
}

export function PaymentsView({ summary, payments, patients, clinicProfile, onRecorded, onOpenPatient }: Props) {
  const [open, setOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [sharePayment, setSharePayment] = useState<Payment | null>(null);

  function patientFor(payment: Payment) {
    return patients.find((x) => x.id === payment.patientId);
  }

  return (
    <div className="view payments-view">
      <header className="page-header">
        <div>
          <p className="eyebrow">Payments</p>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">Tap a payment to open patient</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>+ Add</button>
      </header>

      <div className="stat-strip">
        <div className="stat-card">
          <div className="stat-icon green"><Banknote size={16} /></div>
          <div className="stat-val">{formatRs(summary.todayTotal)}</div>
          <div className="stat-lbl">Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><Banknote size={16} /></div>
          <div className="stat-val">{formatRs(summary.monthTotal)}</div>
          <div className="stat-lbl">This month</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber"><Banknote size={16} /></div>
          <div className="stat-val">{summary.dueCount}</div>
          <div className="stat-lbl">Due</div>
        </div>
      </div>

      {open && (
        <RecordPaymentDialog
          patients={patients}
          onClose={() => setOpen(false)}
          onSaved={onRecorded}
        />
      )}

      {editPayment && (
        <RecordPaymentDialog
          patients={patients}
          payment={editPayment}
          onClose={() => setEditPayment(null)}
          onSaved={() => { setEditPayment(null); onRecorded(); }}
        />
      )}

      {sharePayment && (
        <SharePaymentDialog
          payment={sharePayment}
          patientName={patientFor(sharePayment)?.name || sharePayment.patientName || 'Patient'}
          patientPhone={patientFor(sharePayment)?.phone}
          clinic={clinicProfile}
          onClose={() => setSharePayment(null)}
        />
      )}

      <ul className="payment-list">
        {payments.length === 0 ? (
          <li className="muted">No payments yet.</li>
        ) : payments.map((p) => (
          <li key={p.id}>
            <div
              role="button"
              tabIndex={0}
              className="payment-row payment-row-btn"
              onClick={() => { if (p.patientId) onOpenPatient(p.patientId); }}
              onKeyDown={(e) => {
                if (!p.patientId) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenPatient(p.patientId);
                }
              }}
              aria-disabled={!p.patientId}
            >
              <div>
                <strong>{p.patientName || 'Patient'}</strong>
                <span>{formatRs(p.amount)} · {p.method}</span>
                {p.reference && <span className="ref">{p.reference}</span>}
              </div>
              <div className="payment-row-end">
                <small>{p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN') : ''}</small>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Share payment on WhatsApp"
                  title="Share"
                  onClick={(e) => { e.stopPropagation(); setSharePayment(p); }}
                >
                  <Share2 size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Edit payment"
                  title="Edit"
                  onClick={(e) => { e.stopPropagation(); setEditPayment(p); }}
                >
                  <Pencil size={16} />
                </button>
                {p.patientId && <ChevronRight size={14} className="payment-row-chevron" />}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
