import type { Doctor } from '../types';
import { doctorDisplayName } from '../lib/doctorDisplay';

interface Props {
  doctors: Doctor[];
  value: string | null;
  onChange: (doctorId: string | null) => void;
  counts: Map<string, number>;
  totalCount: number;
}

export function DoctorFilterChips({ doctors, value, onChange, counts, totalCount }: Props) {
  if (doctors.length < 2) return null;

  function toggleDoctor(id: string | null) {
    onChange(value === id ? null : id);
  }

  return (
    <div className="doctor-filter-chips filter-chips" role="toolbar" aria-label="Filter by doctor">
      <button
        type="button"
        className={`filter-chip doctor-filter-chip${value === null ? ' active' : ''}`}
        aria-pressed={value === null}
        onClick={() => toggleDoctor(null)}
      >
        All doctors
        <span className="filter-chip-count">{totalCount}</span>
      </button>
      {doctors.map((doc) => {
        const count = counts.get(doc.id) ?? 0;
        const label = doctorDisplayName(doc);
        return (
          <button
            key={doc.id}
            type="button"
            className={`filter-chip doctor-filter-chip${value === doc.id ? ' active' : ''}`}
            aria-pressed={value === doc.id}
            onClick={() => toggleDoctor(doc.id)}
            title={`${label} — ${count} today`}
          >
            <span
              className="doctor-color-dot doctor-filter-dot"
              style={{ background: doc.appointmentColor || '#2563eb' }}
              aria-hidden
            />
            {label}
            <span className="filter-chip-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
