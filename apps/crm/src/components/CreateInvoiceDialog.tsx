import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X } from 'lucide-react';
import type { CatalogItem, Patient } from '../types';
import { createInvoice, fetchCatalog } from '../lib/api';
import { useScrollLock } from '../hooks/useScrollLock';

interface LineDraft {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  catalogItemId?: string;
}

interface Props {
  patients: Patient[];
  prefillPatientId?: string;
  appointmentId?: string;
  encounterId?: string;
  onClose: () => void;
  onSaved: () => void;
  onToast?: (msg: string, type?: 'ok' | 'err') => void;
}

function newLine(): LineDraft {
  return { key: Math.random().toString(36).slice(2), description: '', quantity: '1', unitPrice: '' };
}

export function CreateInvoiceDialog({ patients, prefillPatientId, appointmentId, encounterId, onClose, onSaved, onToast }: Props) {
  const [patientId, setPatientId] = useState(prefillPatientId || '');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useScrollLock(true);

  useEffect(() => {
    fetchCatalog()
      .then((data) => {
        const items = Array.isArray(data) ? data : data.items || [];
        setCatalog(items);
      })
      .catch(() => {});
  }, []);

  const totalPreview = useMemo(() => {
    return lines.reduce((sum, li) => {
      const q = Number(li.quantity) || 0;
      const u = Number(li.unitPrice) || 0;
      return sum + q * u;
    }, 0);
  }, [lines]);

  function addFromCatalog(item: CatalogItem) {
    setLines((prev) => [
      ...prev,
      {
        key: Math.random().toString(36).slice(2),
        description: item.title,
        quantity: '1',
        unitPrice: String(item.priceNum ?? item.price ?? ''),
        catalogItemId: item.id,
      },
    ]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) {
      setError('Select a patient');
      return;
    }
    const lineItems = lines
      .map((li) => ({
        description: li.description.trim(),
        quantity: Number(li.quantity) > 0 ? Number(li.quantity) : 1,
        unitPrice: Number(li.unitPrice),
        catalogItemId: li.catalogItemId,
      }))
      .filter((li) => li.description && li.unitPrice > 0);
    if (!lineItems.length) {
      setError('Add at least one line item with amount');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await createInvoice({
        patientId,
        notes: notes.trim() || undefined,
        lineItems,
        ...(appointmentId ? { appointmentId } : {}),
        ...(encounterId ? { encounterId } : {}),
      });
      onToast?.('Invoice created', 'ok');
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create invoice';
      setError(msg);
      onToast?.(msg, 'err');
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet modal-sheet-tall" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3>New invoice</h3>
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
                disabled={Boolean(prefillPatientId)}
              >
                <option value="">Select patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.phone}</option>
                ))}
              </select>
            </div>
            {catalog.length > 0 && (
              <div className="form-field">
                <label className="form-label">Add from catalog</label>
                <div className="invoice-catalog-chips">
                  {catalog.slice(0, 12).map((item) => (
                    <button key={item.id} type="button" className="btn btn-ghost btn-sm" onClick={() => addFromCatalog(item)}>
                      <Plus size={14} /> {item.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="form-field">
              <label className="form-label">Line items</label>
              {lines.map((li, idx) => (
                <div key={li.key} className="invoice-line-row">
                  <input
                    className="form-input"
                    placeholder="Description"
                    value={li.description}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, description: v } : x)));
                    }}
                  />
                  <input
                    className="form-input invoice-line-qty"
                    type="number"
                    min="1"
                    value={li.quantity}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: v } : x)));
                    }}
                  />
                  <input
                    className="form-input invoice-line-price"
                    type="number"
                    min="0"
                    placeholder="₹"
                    value={li.unitPrice}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, unitPrice: v } : x)));
                    }}
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Remove line"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines((p) => [...p, newLine()])}>
                <Plus size={14} /> Add line
              </button>
            </div>
            <div className="form-field">
              <label className="form-label">Notes (optional)</label>
              <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <p className="muted" style={{ textAlign: 'right' }}>Total (preview): ₹{totalPreview.toLocaleString('en-IN')}</p>
            {error && <div className="form-error">{error}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary modal-submit-btn" disabled={loading}>
              {loading ? 'Creating…' : 'Create invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
