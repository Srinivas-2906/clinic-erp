import type { Doctor } from '../types';

export type DoctorChoice = 'any' | string;

interface Props {
  doctors: Doctor[];
  value: DoctorChoice;
  onChange: (value: DoctorChoice) => void;
  showAnyAvailable?: boolean;
  lastDoctorName?: string | null;
}

export function BookDoctorPicker({ doctors, value, onChange, showAnyAvailable = true, lastDoctorName }: Props) {
  return (
    <div className="book-doctor-picker">
      {showAnyAvailable && doctors.length > 1 && (
        <button
          type="button"
          className={`book-doctor-option${value === 'any' ? ' selected' : ''}`}
          onClick={() => onChange('any')}
        >
          <span className="book-doctor-option-icon any">✦</span>
          <span>
            <strong>Any available doctor</strong>
            <small>We’ll show open slots across doctors</small>
          </span>
        </button>
      )}

      {doctors.map((doc) => (
        <button
          key={doc.id}
          type="button"
          className={`book-doctor-option${value === doc.id ? ' selected' : ''}`}
          onClick={() => onChange(doc.id)}
        >
          <span
            className="doctor-color-dot book-doctor-option-dot"
            style={{ background: doc.appointmentColor || '#2563eb' }}
            aria-hidden
          />
          <span>
            <strong>{doc.displayName || doc.name}</strong>
            {doc.specialty && <small>{doc.specialty}</small>}
            {lastDoctorName && (doc.displayName === lastDoctorName || doc.name === lastDoctorName) && (
              <small className="book-doctor-last-hint">Last visit doctor</small>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
