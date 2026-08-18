import { createPortal } from 'react-dom';
import { MapPin, MessageSquare, Phone, X } from 'lucide-react';
import type { Payment } from '../types';
import type { ClinicProfile } from '../lib/clinicBranding';
import { formatPaymentReceiptMessage, formatPaymentReceiptPreviewBody } from '../lib/paymentReceipt';
import { normalizeIndiaMsisdn, toWhatsAppUrl } from '../lib/phone';
import { useScrollLock } from '../hooks/useScrollLock';
import { ClinicCareMark } from './ClinicCareMark';

interface Props {
  payment: Payment;
  patientName: string;
  patientPhone?: string;
  clinic: ClinicProfile;
  onClose: () => void;
  onToast?: (msg: string, type?: 'ok' | 'err') => void;
}

export function SharePaymentDialog({
  payment,
  patientName,
  patientPhone,
  clinic,
  onClose,
  onToast,
}: Props) {
  useScrollLock(true);

  const message = formatPaymentReceiptMessage(payment, patientName, clinic);
  const previewBody = formatPaymentReceiptPreviewBody(message);
  const phone = patientPhone?.trim() || '';
  const hasPhone = Boolean(normalizeIndiaMsisdn(phone));
  const monogram = (clinic.signOffName || clinic.name).trim().charAt(0);

  function send() {
    const url = toWhatsAppUrl(phone, message);
    if (!url) {
      onToast?.('Add a valid patient phone number to share on WhatsApp', 'err');
      return;
    }
    window.open(url, '_blank', 'noreferrer');
    onClose();
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet share-payment-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3>Share on WhatsApp</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <div className="modal-body">
            <div className="share-payment-clinic-head">
              <ClinicCareMark size={48} monogram={monogram} />
              <div>
                <strong>{clinic.name}</strong>
                {clinic.tagline && (
                  <span className="share-payment-clinic-tagline">{clinic.tagline}</span>
                )}
                {clinic.doctorName && (
                  <span className="share-payment-clinic-sub">
                    {clinic.doctorName}{clinic.city ? ` · ${clinic.city}` : ''}
                  </span>
                )}
              </div>
            </div>

            <p className="share-payment-intro">
              Send payment receipt to <strong>{patientName}</strong>
              {hasPhone ? (
                <> on WhatsApp (<span className="share-payment-phone">{phone}</span>)</>
              ) : (
                <> — no valid phone number on file</>
              )}
            </p>

            <p className="share-payment-preview-label">Message preview</p>
            <div className="share-payment-bubble" aria-label="WhatsApp message preview">
              <div className="share-payment-bubble-head">
                <ClinicCareMark size={32} monogram={monogram} />
                <span>{clinic.name}</span>
              </div>
              <pre>{previewBody}</pre>
            </div>

            {(clinic.phone || clinic.addressShort) && (
              <div className="share-payment-meta">
                {clinic.phone && (
                  <span><Phone size={12} /> Clinic: {clinic.phone}</span>
                )}
                {clinic.addressShort && (
                  <span><MapPin size={12} /> {clinic.addressShort}</span>
                )}
              </div>
            )}

            {!hasPhone && (
              <p className="form-error" style={{ marginTop: 12 }}>
                Update the patient&apos;s phone number before sharing.
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary modal-submit-btn share-payment-send"
              disabled={!hasPhone}
              onClick={send}
            >
              <MessageSquare size={16} />
              Send on WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
