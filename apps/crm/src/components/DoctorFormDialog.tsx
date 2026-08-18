import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Doctor } from '../types';
import { useScrollLock } from '../hooks/useScrollLock';

interface Props {
  doctor?: Doctor | null;
  onClose: () => void;
  onSave: (data: Partial<Doctor> & { name: string }) => Promise<void>;
}

export function DoctorFormDialog({ doctor, onClose, onSave }: Props) {
  const isEdit = Boolean(doctor);
  const [name, setName] = useState(doctor?.name || '');
  const [displayName, setDisplayName] = useState(doctor?.displayName || '');
  const [specialty, setSpecialty] = useState(doctor?.specialty || '');
  const [phone, setPhone] = useState(doctor?.phone || '');
  const [email, setEmail] = useState(doctor?.email || '');
  const [qualification, setQualification] = useState(doctor?.qualification || '');
  const [registrationNumber, setRegistrationNumber] = useState(doctor?.registrationNumber || '');
  const [appointmentColor, setAppointmentColor] = useState(doctor?.appointmentColor || '#2563eb');
  const [defaultSlotDuration, setDefaultSlotDuration] = useState(String(doctor?.defaultSlotDuration ?? 30));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useScrollLock(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const valid = name.trim().length >= 2;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        displayName: displayName.trim() || name.trim(),
        specialty: specialty.trim(),
        phone: phone.trim(),
        email: email.trim(),
        qualification: qualification.trim(),
        registrationNumber: registrationNumber.trim(),
        appointmentColor,
        defaultSlotDuration: Number(defaultSlotDuration) || 30,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save doctor');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet doctor-form-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3>{isEdit ? 'Edit doctor' : 'Add doctor'}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {error && <div className="form-error">{error}</div>}

            <div className="form-field">
              <label className="form-label" htmlFor="doc-name">Full name *</label>
              <input
                id="doc-name"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Priya Sharma"
                autoFocus
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="doc-display">Display name</label>
              <input
                id="doc-display"
                className="form-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Shown on appointments"
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="doc-specialty">Specialty</label>
              <input
                id="doc-specialty"
                className="form-input"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="General Dentistry"
              />
            </div>

            <div className="form-row">
              <div className="form-field">
                <label className="form-label" htmlFor="doc-phone">Phone</label>
                <input
                  id="doc-phone"
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile"
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="doc-email">Email</label>
                <input
                  id="doc-email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor@clinic.in"
                />
              </div>
            </div>

            <details className="doctor-form-details">
              <summary>More details</summary>
              <div className="doctor-form-details-body">
                <div className="form-field">
                  <label className="form-label" htmlFor="doc-qual">Qualification</label>
                  <input
                    id="doc-qual"
                    className="form-input"
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                    placeholder="BDS, MDS"
                  />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="doc-reg">Registration number</label>
                  <input
                    id="doc-reg"
                    className="form-input"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    placeholder="Medical council ID"
                  />
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label className="form-label" htmlFor="doc-color">Calendar color</label>
                    <input
                      id="doc-color"
                      type="color"
                      className="form-input form-color-input"
                      value={appointmentColor}
                      onChange={(e) => setAppointmentColor(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label" htmlFor="doc-slot">Default slot (min)</label>
                    <input
                      id="doc-slot"
                      type="number"
                      min={10}
                      max={120}
                      step={5}
                      className="form-input"
                      value={defaultSlotDuration}
                      onChange={(e) => setDefaultSlotDuration(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </details>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary modal-submit-btn" disabled={!valid || saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add doctor'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
