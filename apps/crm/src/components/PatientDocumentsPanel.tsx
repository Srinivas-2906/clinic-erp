import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Trash2, Upload, RefreshCw } from 'lucide-react';
import type { Encounter, PatientClinicalDocument } from '../types';
import {
  deletePatientClinicalDocument,
  fetchPatientClinicalDocuments,
  uploadPatientClinicalDocument,
} from '../lib/api';
import { AuthenticatedClinicRecordThumb } from './AuthenticatedClinicRecordThumb';
import { MAX_PRESCRIPTION_FILE_BYTES, PRESCRIPTION_FILE_TOO_LARGE_MESSAGE } from '../lib/uploads';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.pdf';

type Props = {
  patientId: string;
  encounters?: Encounter[];
  onToast?: (msg: string, type?: 'ok' | 'err') => void;
};

export function PatientDocumentsPanel({ patientId, encounters = [], onToast }: Props) {
  const [docs, setDocs] = useState<PatientClinicalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [encounterId, setEncounterId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPatientClinicalDocuments(patientId);
      setDocs(res.documents || []);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Could not load documents', 'err');
    } finally {
      setLoading(false);
    }
  }, [patientId, onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFilesSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_PRESCRIPTION_FILE_BYTES) {
      onToast?.(PRESCRIPTION_FILE_TOO_LARGE_MESSAGE, 'err');
      return;
    }
    setUploading(true);
    try {
      const label = title.trim() || file.name.replace(/\.[^.]+$/, '') || 'Clinical document';
      await uploadPatientClinicalDocument(patientId, file, {
        title: label,
        encounterId: encounterId || undefined,
      });
      onToast?.('Document uploaded', 'ok');
      setTitle('');
      if (inputRef.current) inputRef.current.value = '';
      await load();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Upload failed', 'err');
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(doc: PatientClinicalDocument) {
    if (!window.confirm(`Remove “${doc.title}”?`)) return;
    try {
      await deletePatientClinicalDocument(patientId, doc.id);
      onToast?.('Document removed', 'ok');
      await load();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Could not delete', 'err');
    }
  }

  const finalizedEncounters = encounters.filter((e) => e.status === 'finalized');

  return (
    <div className="panel patient-documents-panel" data-testid="patient-documents-panel">
      <div className="panel-head">
        <FileText size={14} color="var(--brand)" />
        <span className="panel-title">Clinical documents</span>
        <span className="muted" style={{ fontSize: 12 }}>{docs.length}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} aria-label="Refresh documents">
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="panel-body">
        <div className="patient-documents-upload">
          <div className="form-field">
            <label className="form-label" htmlFor="doc-title">Label</label>
            <input
              id="doc-title"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. OPG, lab report"
              maxLength={120}
            />
          </div>
          {finalizedEncounters.length > 0 && (
            <div className="form-field">
              <label className="form-label" htmlFor="doc-encounter">Link to visit (optional)</label>
              <select
                id="doc-encounter"
                className="form-input form-select"
                value={encounterId}
                onChange={(e) => setEncounterId(e.target.value)}
              >
                <option value="">None</option>
                {finalizedEncounters.map((enc) => (
                  <option key={enc.id} value={enc.id}>
                    {enc.finalizedAt
                      ? new Date(enc.finalizedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })
                      : enc.id.slice(0, 8)}
                    {enc.chiefComplaint ? ` — ${enc.chiefComplaint.slice(0, 40)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            capture="environment"
            className="patient-documents-file-input"
            data-testid="patient-documents-file-input"
            onChange={(e) => void onFilesSelected(e.target.files)}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm patient-documents-upload-btn"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={14} />
            {uploading ? 'Uploading…' : 'Choose file or photo'}
          </button>
          <p className="form-hint">PDF or image up to 8 MB. Files are private to your clinic.</p>
        </div>

        {loading ? (
          <p className="muted patient-documents-loading">Loading documents…</p>
        ) : docs.length === 0 ? (
          <p className="muted">No clinical documents yet.</p>
        ) : (
          <ul className="patient-documents-list">
            {docs.map((doc) => (
              <li key={doc.id} className="patient-documents-card">
                <div className="patient-documents-card-preview">
                  <AuthenticatedClinicRecordThumb url={doc.fileUrl} alt={doc.title} className="record-thumb" />
                </div>
                <div className="patient-documents-card-meta">
                  <strong className="patient-documents-card-title">{doc.title}</strong>
                  <span className="muted patient-documents-card-sub">
                    {doc.createdAt
                      ? new Date(doc.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                      : ''}
                    {doc.byteSize ? ` · ${Math.max(1, Math.round(doc.byteSize / 1024))} KB` : ''}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm patient-documents-delete"
                    aria-label={`Remove ${doc.title}`}
                    onClick={() => void onDelete(doc)}
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
