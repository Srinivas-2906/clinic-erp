import { useState } from 'react';
import type { Encounter } from '../types';
import { amendEncounter } from '../lib/api';
import { useScrollLock } from '../hooks/useScrollLock';

interface Props {
  encounter: Encounter;
  onClose: () => void;
  onSaved: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function EncounterAmendDialog({ encounter, onClose, onSaved, onToast }: Props) {
  const [reason, setReason] = useState('');
  const [clinicalNote, setClinicalNote] = useState(encounter.clinicalNote || '');
  const [historySummary, setHistorySummary] = useState(encounter.historySummary || '');
  const [saving, setSaving] = useState(false);

  useScrollLock(true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 8) {
      onToast('Enter a clear reason (at least 8 characters)', 'err');
      return;
    }
    setSaving(true);
    try {
      await amendEncounter(encounter.id, {
        reason: reason.trim(),
        patch: {
          clinicalNote: clinicalNote.trim(),
          historySummary: historySummary.trim(),
        },
      });
      onToast('Amendment recorded');
      onSaved();
      onClose();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Amendment failed', 'err');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3>Amend consultation record</h3>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
            Finalized records cannot be edited directly. Changes are stored as an auditable amendment.
          </p>
          <div className="form-field">
            <label className="form-label" htmlFor="amend-reason">Reason for amendment</label>
            <input
              id="amend-reason"
              className="form-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. corrected clinical note after review"
              required
              minLength={8}
            />
          </div>
          <div className="form-field">
            <label className="form-label">Clinical note</label>
            <textarea
              className="form-input"
              rows={3}
              value={clinicalNote}
              onChange={(e) => setClinicalNote(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-label">History summary</label>
            <textarea
              className="form-input"
              rows={2}
              value={historySummary}
              onChange={(e) => setHistorySummary(e.target.value)}
            />
          </div>
          <div className="modal-footer" style={{ padding: 0, marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>Save amendment</button>
          </div>
        </form>
      </div>
    </div>
  );
}
