import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, FileText, X } from 'lucide-react';
import type { Patient } from '../types';
import { GENDERS, PATIENT_SOURCES } from '../types';
import { createPatient, updatePatient } from '../lib/api';
import { uploadPatientPrescription } from '../lib/uploads';
import { resolveTenantSlug } from '../lib/tenant';
import { useScrollLock } from '../hooks/useScrollLock';
import {
  formatPhone10,
  isValidAge,
  isValidPatientName,
  isValidPhone10,
  localPhoneFromPatient,
  sanitizeAge,
  sanitizePhoneDigits,
} from '../lib/patientInput';

interface Props {
  patient?: Patient | null;
  onClose: () => void;
  onSaved: (patient: Patient) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function PatientFormDialog({ patient, onClose, onSaved, onToast }: Props) {
  const isEdit = Boolean(patient);
  const [name, setName] = useState(patient?.name || '');
  const [phone, setPhone] = useState(() => (patient ? localPhoneFromPatient(patient) : ''));
  const [email, setEmail] = useState(patient?.email || '');
  const [age, setAge] = useState(patient?.age != null ? String(patient.age) : '');
  const [gender, setGender] = useState(patient?.gender || '');
  const [source, setSource] = useState(patient?.source || 'Walk-in');
  const [chiefComplaint, setChiefComplaint] = useState(patient?.chiefComplaint || '');
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [prescriptionPreview, setPrescriptionPreview] = useState<string>(patient?.prescriptionUrl || patient?.photoUrl || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const cameraInputRef = useRef<HTMLInputElement>(null);

  useScrollLock(true);

  useEffect(() => {
    if (!prescriptionFile) return;
    const url = URL.createObjectURL(prescriptionFile);
    setPrescriptionPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [prescriptionFile]);

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPrescriptionFile(file);
    e.target.value = '';
  }

  const phoneDigits = sanitizePhoneDigits(phone);
  const valid = isValidPatientName(name) && isValidPhone10(phone) && isValidAge(age);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    void submit();
  }

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    setError('');
    try {
      let prescriptionUrl = patient?.prescriptionUrl || patient?.photoUrl || '';
      if (prescriptionFile) {
        try {
          const key = patient?.id || phoneDigits || Date.now().toString();
          prescriptionUrl = await uploadPatientPrescription(resolveTenantSlug() || 'default', key, prescriptionFile);
        } catch (err) {
          const detail = err instanceof Error ? err.message : 'Upload failed';
          console.error('Prescription upload failed:', err);
          onToast(`Image upload failed: ${detail}`, 'err');
        }
      }

      const payload = {
        name: name.trim(),
        phone: formatPhone10(phone),
        email: email.trim() || undefined,
        age: Number(age),
        gender: gender || undefined,
        chiefComplaint: chiefComplaint.trim() || undefined,
        source,
        prescriptionUrl,
      };

      const saved = isEdit
        ? await updatePatient(patient!.id, payload)
        : await createPatient(payload as { name: string; phone: string });

      onToast(isEdit ? 'Patient updated' : 'Patient added');
      onSaved(saved);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save patient';
      setError(msg);
      onToast(msg, 'err');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3>{isEdit ? 'Edit patient' : 'Add patient'}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            <div className="form-field">
              <label className="form-label">Full name</label>
              <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Patient name"
                autoFocus={!isEdit}
              />
            </div>

            <div className="form-field">
              <label className="form-label">Phone number</label>
              <div className="phone-input-wrap">
                <span className="phone-input-prefix" aria-hidden="true">+91</span>
                <input
                  className="form-input phone-input-local"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={phone}
                  onChange={(e) => setPhone(sanitizePhoneDigits(e.target.value))}
                  placeholder="10-digit mobile"
                  maxLength={10}
                />
              </div>
              {phone.length > 0 && !isValidPhone10(phone) && (
                <p className="form-hint form-hint-warn">Enter exactly 10 digits ({phoneDigits.length}/10)</p>
              )}
            </div>

            <div className="form-row">
              <div className="form-field">
                <label className="form-label">Age</label>
                <input
                  className="form-input"
                  value={age}
                  onChange={(e) => setAge(sanitizeAge(e.target.value))}
                  placeholder="e.g. 32"
                  inputMode="numeric"
                  maxLength={3}
                  required
                />
              </div>
              <div className="form-field">
                <label className="form-label">Gender</label>
                <select className="form-input" value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">Select</option>
                  {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            <div className="form-field">
              <label className="form-label" style={{ fontWeight: 500 }}>Email <span style={{ color: 'var(--muted)' }}>(optional)</span></label>
              <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" />
            </div>

            <div className="form-field">
              <label className="form-label">How did they come in?</label>
              <select className="form-input" value={source} onChange={(e) => setSource(e.target.value)}>
                {PATIENT_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" style={{ fontWeight: 500 }}>Problem <span style={{ color: 'var(--muted)' }}>(if known)</span></label>
              <input className="form-input" value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} placeholder="e.g. tooth pain" />
            </div>

            <div className="form-field">
              <label className="form-label"><FileText size={12} /> Prescription / record photo</label>
              <div className="prescription-picker">
                <button
                  type="button"
                  className={`prescription-picker-btn${prescriptionPreview ? ' has-image' : ''}`}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  {prescriptionPreview ? (
                    <img src={prescriptionPreview} alt="Prescription" />
                  ) : (
                    <>
                      <Camera size={22} strokeWidth={1.5} />
                      <span>Tap to capture prescription</span>
                    </>
                  )}
                </button>
                {prescriptionPreview && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPrescriptionFile(null); setPrescriptionPreview(''); }}>
                    Remove photo
                  </button>
                )}
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden-file-input"
                onChange={handlePickFile}
              />
            </div>

            {error && <div className="form-error">{error}</div>}

            {!valid && !saving && (
              <p className="form-hint">
                {!isValidPatientName(name)
                  ? 'Add patient name (2+ characters)'
                  : !isValidPhone10(phone)
                    ? 'Enter a 10-digit mobile number'
                    : 'Age is required'}
              </p>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary modal-submit-btn" disabled={!valid || saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add patient'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
