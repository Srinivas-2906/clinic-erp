import { useMemo, useState } from 'react';
import { Banknote, ChevronRight, FileText, Pencil, RotateCcw, Share2 } from 'lucide-react';
import type { Payment, PaymentSummary, Patient, PatientInvoice } from '../types';
import type { ClinicProfile } from '../lib/clinicBranding';
import { voidInvoice, fetchInvoice } from '../lib/api';
import { RecordPaymentDialog } from './RecordPaymentDialog';
import { SharePaymentDialog } from './SharePaymentDialog';
import { CreateInvoiceDialog } from './CreateInvoiceDialog';
import { InvoiceDetailDialog } from './InvoiceDetailDialog';
import { RefundPaymentDialog } from './RefundPaymentDialog';

function formatRs(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function invoiceStatusLabel(status: string) {
  if (status === 'paid') return 'Paid';
  if (status === 'partial') return 'Partial';
  if (status === 'void') return 'Void';
  return 'Unpaid';
}

function refundableAmount(payment: Payment, payments: Payment[]) {
  if (payment.kind === 'refund' || payment.amount <= 0) return 0;
  const refunded = payments
    .filter((p) => p.relatedPaymentId === payment.id && p.kind === 'refund')
    .reduce((s, p) => s + Math.abs(p.amount), 0);
  return Math.round((payment.amount - refunded) * 100) / 100;
}

interface Props {
  summary: PaymentSummary;
  payments: Payment[];
  invoices: PatientInvoice[];
  patients: Patient[];
  clinicProfile: ClinicProfile;
  canRecordPayments: boolean;
  canManageFinancials: boolean;
  onRecorded: () => void;
  onOpenPatient: (patientId: string) => void;
  onToast?: (msg: string, type?: 'ok' | 'err') => void;
}

export function PaymentsView({
  summary,
  payments,
  invoices,
  patients,
  clinicProfile,
  canRecordPayments,
  canManageFinancials,
  onRecorded,
  onOpenPatient,
  onToast,
}: Props) {
  const [section, setSection] = useState<'invoices' | 'payments'>('invoices');
  const [recordOpen, setRecordOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [sharePayment, setSharePayment] = useState<Payment | null>(null);
  const [refundPaymentRow, setRefundPaymentRow] = useState<Payment | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<PatientInvoice | null>(null);
  const [payAgainstInvoice, setPayAgainstInvoice] = useState<PatientInvoice | null>(null);

  const patientNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patients) m.set(p.id, p.name);
    for (const inv of invoices) {
      if (!m.has(inv.patientId)) {
        const pay = payments.find((x) => x.patientId === inv.patientId);
        if (pay?.patientName) m.set(inv.patientId, pay.patientName);
      }
    }
    return m;
  }, [patients, invoices, payments]);

  function patientFor(payment: Payment) {
    return patients.find((x) => x.id === payment.patientId);
  }

  async function handleVoidInvoice(inv: PatientInvoice) {
    if (!window.confirm('Void this invoice? This cannot receive payments afterward.')) return;
    try {
      await voidInvoice(inv.id, 'Voided from CRM');
      onToast?.('Invoice voided', 'ok');
      setDetailInvoice(null);
      onRecorded();
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not void invoice', 'err');
    }
  }

  const outstanding = summary.outstandingBalance ?? 0;
  const openCount = summary.openInvoiceCount ?? invoices.filter((i) => i.status === 'open' || i.status === 'partial').length;

  return (
    <div className="view payments-view">
      <header className="page-header">
        <div>
          <p className="eyebrow">Billing</p>
          <h1 className="page-title">Invoices & payments</h1>
          <p className="page-subtitle">Server-calculated totals · legacy payments stay separate</p>
        </div>
        {canRecordPayments && (
          <div className="page-header-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setInvoiceOpen(true)}>+ Invoice</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setPayAgainstInvoice(null); setRecordOpen(true); }}>+ Payment</button>
          </div>
        )}
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
          <div className="stat-icon amber"><FileText size={16} /></div>
          <div className="stat-val">{formatRs(outstanding)}</div>
          <div className="stat-lbl">Outstanding ({openCount})</div>
        </div>
      </div>

      <div className="team-access-filters" style={{ marginBottom: 12 }}>
        <button type="button" className={`team-filter-btn${section === 'invoices' ? ' active' : ''}`} onClick={() => setSection('invoices')}>
          Invoices
        </button>
        <button type="button" className={`team-filter-btn${section === 'payments' ? ' active' : ''}`} onClick={() => setSection('payments')}>
          Payment history
        </button>
      </div>

      {invoiceOpen && (
        <CreateInvoiceDialog
          patients={patients}
          onClose={() => setInvoiceOpen(false)}
          onSaved={onRecorded}
          onToast={onToast}
        />
      )}

      {(recordOpen || payAgainstInvoice) && (
        <RecordPaymentDialog
          patients={patients}
          prefillPatientId={payAgainstInvoice?.patientId}
          invoice={payAgainstInvoice}
          onClose={() => { setRecordOpen(false); setPayAgainstInvoice(null); }}
          onSaved={onRecorded}
          onToast={onToast}
        />
      )}

      {editPayment && (
        <RecordPaymentDialog
          patients={patients}
          payment={editPayment}
          onClose={() => setEditPayment(null)}
          onSaved={() => { setEditPayment(null); onRecorded(); }}
          onToast={onToast}
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

      {refundPaymentRow && (
        <RefundPaymentDialog
          payment={refundPaymentRow}
          maxRefundable={refundableAmount(refundPaymentRow, payments)}
          onClose={() => setRefundPaymentRow(null)}
          onSaved={onRecorded}
          onToast={onToast}
        />
      )}

      {detailInvoice && (
        <InvoiceDetailDialog
          invoice={detailInvoice}
          patientName={patientNameById.get(detailInvoice.patientId) || 'Patient'}
          clinicProfile={clinicProfile}
          canRecordPayments={canRecordPayments}
          canManageFinancials={canManageFinancials}
          onClose={() => setDetailInvoice(null)}
          onRecordPayment={(inv) => { setDetailInvoice(null); setPayAgainstInvoice(inv); }}
          onVoid={handleVoidInvoice}
          onRefreshInvoice={async (id) => {
            try {
              return await fetchInvoice(id);
            } catch {
              return null;
            }
          }}
        />
      )}

      {section === 'invoices' ? (
        <ul className="payment-list">
          {invoices.length === 0 ? (
            <li className="muted">No invoices yet. Create one to track balances, or keep using quick payments without invoices.</li>
          ) : invoices.map((inv) => (
            <li key={inv.id}>
              <div
                role="button"
                tabIndex={0}
                className="payment-row payment-row-btn"
                onClick={() => setDetailInvoice(inv)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetailInvoice(inv);
                  }
                }}
              >
                <div>
                  <strong>{patientNameById.get(inv.patientId) || 'Patient'}</strong>
                  <span>{formatRs(inv.total)} · {invoiceStatusLabel(inv.status)}</span>
                  {inv.balanceDue > 0 && inv.status !== 'void' && (
                    <span className="ref">Due {formatRs(inv.balanceDue)}</span>
                  )}
                </div>
                <div className="payment-row-end">
                  <small>{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN') : ''}</small>
                  <ChevronRight size={14} className="payment-row-chevron" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="payment-list">
          {payments.length === 0 ? (
            <li className="muted">No payments yet.</li>
          ) : payments.map((p) => {
            const isRefund = p.kind === 'refund';
            const canEdit = canRecordPayments && !isRefund && p.kind !== 'refund';
            const maxRef = refundableAmount(p, payments);
            return (
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
                    <span style={isRefund ? { color: 'var(--danger, #b91c1c)' } : undefined}>
                      {isRefund ? 'Refund ' : ''}{formatRs(p.amount)} · {p.method}
                    </span>
                    {p.invoiceId && <span className="ref">Invoice linked</span>}
                    {isRefund && p.relatedPaymentId && <span className="ref">↩ original payment</span>}
                    {p.reference && <span className="ref">{p.reference}</span>}
                  </div>
                  <div className="payment-row-end">
                    <small>{p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN') : ''}</small>
                    {!isRefund && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Share payment on WhatsApp"
                        title="Share"
                        onClick={(e) => { e.stopPropagation(); setSharePayment(p); }}
                      >
                        <Share2 size={16} />
                      </button>
                    )}
                    {canManageFinancials && !isRefund && maxRef > 0 && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Record refund"
                        title="Record refund (ledger)"
                        onClick={(e) => { e.stopPropagation(); setRefundPaymentRow(p); }}
                      >
                        <RotateCcw size={16} />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Edit payment"
                        title="Edit"
                        onClick={(e) => { e.stopPropagation(); setEditPayment(p); }}
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                    {p.patientId && <ChevronRight size={14} className="payment-row-chevron" />}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
