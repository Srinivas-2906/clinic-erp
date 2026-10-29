import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, ChevronRight, FileText, X } from 'lucide-react';
import type { Appointment, Patient, PatientInvoice } from '../types';
import type { ClinicProfile } from '../lib/clinicBranding';
import { fetchInvoices, fetchInvoice } from '../lib/api';
import { useScrollLock } from '../hooks/useScrollLock';
import { CreateInvoiceDialog } from './CreateInvoiceDialog';
import { InvoiceDetailDialog } from './InvoiceDetailDialog';
import { RecordPaymentDialog } from './RecordPaymentDialog';

interface Props {
  appointment: Appointment;
  encounterId?: string | null;
  patients: Patient[];
  clinicProfile: ClinicProfile;
  canRecordPayments: boolean;
  canManageFinancials: boolean;
  onClose: () => void;
  onContinue: () => void;
  onGoToToday: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
  onDataChanged: () => void;
}

function pickVisitInvoice(invoices: PatientInvoice[], appointment: Appointment, encounterId?: string | null) {
  const apptId = appointment.id;
  const encId = encounterId || appointment.encounterId || null;
  return invoices.find((inv) => {
    if (inv.status === 'void') return false;
    if (apptId && inv.appointmentId === apptId) return true;
    if (encId && inv.encounterId === encId) return true;
    return false;
  }) ?? null;
}

export function VisitBillingHandoffDialog({
  appointment,
  encounterId,
  patients,
  clinicProfile,
  canRecordPayments,
  canManageFinancials,
  onClose,
  onContinue,
  onGoToToday,
  onToast,
  onDataChanged,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [visitInvoice, setVisitInvoice] = useState<PatientInvoice | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<PatientInvoice | null>(null);
  const [recordInvoice, setRecordInvoice] = useState<PatientInvoice | null>(null);

  useScrollLock(true);

  const resolvedEncounterId = encounterId || appointment.encounterId || null;
  const patientName = appointment.patientName || 'Patient';

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchInvoices({ patientId: appointment.patientId });
        if (!alive) return;
        setVisitInvoice(pickVisitInvoice(data.invoices || [], appointment, resolvedEncounterId));
      } catch {
        if (alive) onToast('Could not load invoices', 'err');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [appointment.id, appointment.patientId, resolvedEncounterId, onToast]);

  const billingEnabled = canRecordPayments;

  async function reloadInvoice() {
    const data = await fetchInvoices({ patientId: appointment.patientId });
    const inv = pickVisitInvoice(data.invoices || [], appointment, resolvedEncounterId);
    setVisitInvoice(inv);
    onDataChanged();
    return inv;
  }

  const headline = useMemo(() => {
    if (!billingEnabled) return 'Consultation saved';
    if (visitInvoice) return 'Invoice linked to this visit';
    return 'Billing for this visit';
  }, [billingEnabled, visitInvoice]);

  if (createOpen) {
    return (
      <CreateInvoiceDialog
        patients={patients}
        prefillPatientId={appointment.patientId}
        appointmentId={appointment.id}
        encounterId={resolvedEncounterId || undefined}
        onClose={() => setCreateOpen(false)}
        onSaved={async () => {
          setCreateOpen(false);
          const inv = await reloadInvoice();
          if (inv) {
            onToast('Invoice ready for this visit', 'ok');
            setDetailInvoice(inv);
          }
        }}
        onToast={onToast}
      />
    );
  }

  if (detailInvoice) {
    return (
      <InvoiceDetailDialog
        invoice={detailInvoice}
        patientName={patientName}
        clinicProfile={clinicProfile}
        canRecordPayments={canRecordPayments}
        canManageFinancials={canManageFinancials}
        onClose={() => setDetailInvoice(null)}
        onRecordPayment={(inv) => { setDetailInvoice(null); setRecordInvoice(inv); }}
        onVoid={async () => {
          setDetailInvoice(null);
          await reloadInvoice();
        }}
        onRefreshInvoice={async (id) => fetchInvoice(id)}
      />
    );
  }

  if (recordInvoice) {
    return (
      <RecordPaymentDialog
        patients={patients}
        invoice={recordInvoice}
        onClose={() => setRecordInvoice(null)}
        onSaved={() => {
          setRecordInvoice(null);
          void reloadInvoice().then((inv) => { if (inv) setDetailInvoice(inv); });
        }}
        onToast={onToast}
      />
    );
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose} data-testid="visit-billing-handoff">
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3>{headline}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <p className="muted" style={{ marginTop: 0 }}>
            {patientName} · visit marked complete. No charge is applied automatically.
          </p>
          {loading ? (
            <p className="muted">Checking invoices…</p>
          ) : !billingEnabled ? (
            <p>Front desk can create an invoice from Today or Payments when the patient is ready.</p>
          ) : visitInvoice ? (
            <div className="panel" style={{ padding: 12 }}>
              <strong>{visitInvoice.status === 'paid' ? 'Paid' : 'Open balance'}</strong>
              <span className="muted" style={{ display: 'block', marginTop: 4 }}>
                ₹{visitInvoice.balanceDue.toLocaleString('en-IN')} due · total ₹{visitInvoice.total.toLocaleString('en-IN')}
              </span>
            </div>
          ) : (
            <p>Create an invoice for services from this visit, or continue without billing.</p>
          )}
        </div>
        <div className="modal-footer" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
          {billingEnabled && !loading && (
            visitInvoice ? (
              <>
                <button type="button" className="btn btn-primary" onClick={() => setDetailInvoice(visitInvoice)}>
                  <FileText size={14} /> View invoice
                </button>
                {visitInvoice.balanceDue > 0 && (
                  <button type="button" className="btn btn-ghost" onClick={() => setRecordInvoice(visitInvoice)}>
                    <Banknote size={14} /> Record payment
                  </button>
                )}
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                <FileText size={14} /> Create invoice
              </button>
            )
          )}
          <button type="button" className="btn btn-ghost" onClick={() => { onContinue(); onClose(); }}>
            Continue without billing
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onGoToToday(); onClose(); }}>
            Open Today schedule <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
