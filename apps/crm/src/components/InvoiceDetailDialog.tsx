import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import type { PatientInvoice } from '../types';
import type { ClinicProfile } from '../lib/clinicBranding';
import { openInvoicePrintWindow } from '../lib/invoiceDocument';
import { useScrollLock } from '../hooks/useScrollLock';

function formatRs(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function statusBadge(status: string) {
  if (status === 'paid') return 'Paid';
  if (status === 'partial') return 'Partial';
  if (status === 'void') return 'Void';
  return 'Unpaid';
}

interface Props {
  invoice: PatientInvoice;
  patientName: string;
  clinicProfile: ClinicProfile;
  canRecordPayments: boolean;
  canManageFinancials: boolean;
  onClose: () => void;
  onRecordPayment: (invoice: PatientInvoice) => void;
  onVoid: (invoice: PatientInvoice) => void;
}

export function InvoiceDetailDialog({
  invoice,
  patientName,
  clinicProfile,
  canRecordPayments,
  canManageFinancials,
  onClose,
  onRecordPayment,
  onVoid,
}: Props) {
  useScrollLock(true);

  const canPay = canRecordPayments && invoice.status !== 'void' && invoice.status !== 'paid' && invoice.balanceDue > 0;
  const canVoid = canManageFinancials && invoice.status !== 'void' && invoice.amountPaid <= 0;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet modal-sheet-tall" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3>Invoice · {statusBadge(invoice.status)}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <p><strong>{patientName}</strong></p>
          <p className="muted">{invoice.createdAt ? new Date(invoice.createdAt).toLocaleString('en-IN') : ''}</p>
          <ul className="invoice-detail-lines">
            {invoice.lineItems.map((li) => (
              <li key={li.id || `${li.description}-${li.unitPrice}`}>
                <span>{li.description} × {li.quantity}</span>
                <span>{formatRs(li.amount ?? li.quantity * li.unitPrice)}</span>
              </li>
            ))}
          </ul>
          <div className="invoice-detail-totals">
            <div>Total {formatRs(invoice.total)}</div>
            <div>Paid {formatRs(invoice.amountPaid)}</div>
            <div><strong>Balance {formatRs(invoice.balanceDue)}</strong></div>
          </div>
          {invoice.notes?.trim() && <p className="muted">Note: {invoice.notes.trim()}</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={() => openInvoicePrintWindow(invoice, patientName, clinicProfile)}>
            <Printer size={16} /> Print
          </button>
          {canVoid && (
            <button type="button" className="btn btn-ghost" onClick={() => onVoid(invoice)}>
              Void
            </button>
          )}
          {canPay && (
            <button type="button" className="btn btn-primary" onClick={() => onRecordPayment(invoice)}>
              Record payment
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
