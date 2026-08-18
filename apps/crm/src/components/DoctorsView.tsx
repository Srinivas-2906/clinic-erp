import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Stethoscope, UserX, UserCheck } from 'lucide-react';
import type { Doctor } from '../types';
import { useCreateDoctor, useDoctors, useUpdateDoctor, useDoctorSessions } from '../hooks/useDoctors';
import { summarizeSchedule } from '../lib/scheduleUtils';
import { DoctorFormDialog } from './DoctorFormDialog';
import { DoctorScheduleEditor } from './DoctorScheduleEditor';
import { DoctorTimeOffPanel } from './DoctorTimeOffPanel';

interface Props {
  onToast: (text: string, type?: 'ok' | 'err') => void;
}

function DoctorSchedulePanel({
  doctor,
  expanded,
  onToast,
}: {
  doctor: Doctor;
  expanded: boolean;
  onToast: Props['onToast'];
}) {
  const { data: sessions = [], isLoading } = useDoctorSessions(doctor.id, expanded);

  if (!expanded) return null;

  return (
    <div className="doctor-card-panel">
      <div className="doctor-panel-section">
        <h4>Working hours</h4>
        {!isLoading && (
          <p className="doctor-schedule-summary">{summarizeSchedule(sessions)}</p>
        )}
        <DoctorScheduleEditor
          doctorId={doctor.id}
          defaultSlotDuration={doctor.defaultSlotDuration ?? 30}
          onToast={onToast}
        />
      </div>
      <div className="doctor-panel-section">
        <h4>Time off</h4>
        <DoctorTimeOffPanel doctorId={doctor.id} onToast={onToast} />
      </div>
      <div className="doctor-panel-section">
        <h4>Services</h4>
        <p className="doctor-panel-muted">All clinic services unless restricted. Service assignment coming soon.</p>
      </div>
    </div>
  );
}

function DoctorCard({
  doctor,
  onEdit,
  onToggleActive,
  onToast,
  busy,
}: {
  doctor: Doctor;
  onEdit: () => void;
  onToggleActive: () => void;
  onToast: Props['onToast'];
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`doctor-card${doctor.isActive === false ? ' inactive' : ''}`}>
      <div className="doctor-card-main">
        <div
          className="doctor-color-dot"
          style={{ background: doctor.appointmentColor || '#2563eb' }}
          aria-hidden
        />
        <div className="doctor-card-info">
          <div className="doctor-card-name">{doctor.displayName || doctor.name}</div>
          {doctor.specialty && <div className="doctor-card-specialty">{doctor.specialty}</div>}
          <div className="doctor-card-meta">
            {doctor.phone && <span>{doctor.phone}</span>}
            {doctor.email && <span>{doctor.email}</span>}
            {doctor.isActive === false && <span className="doctor-inactive-pill">Inactive</span>}
          </div>
        </div>
        <div className="doctor-card-actions">
          <button type="button" className="btn-secondary btn-sm" onClick={onEdit} disabled={busy}>
            <Pencil size={14} /> Edit
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={onToggleActive}
            disabled={busy}
            title={doctor.isActive === false ? 'Activate doctor' : 'Deactivate doctor'}
          >
            {doctor.isActive === false ? <><UserCheck size={14} /> Activate</> : <><UserX size={14} /> Deactivate</>}
          </button>
          <button
            type="button"
            className="icon-btn doctor-expand-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide schedule' : 'Show schedule'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      <DoctorSchedulePanel doctor={doctor} expanded={expanded} onToast={onToast} />
    </div>
  );
}

export function DoctorsView({ onToast }: Props) {
  const [showInactive, setShowInactive] = useState(false);
  const [formDoctor, setFormDoctor] = useState<Doctor | null | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: doctors = [], isLoading, error, refetch } = useDoctors(showInactive);
  const createMutation = useCreateDoctor();
  const updateMutation = useUpdateDoctor();

  async function handleSave(data: Partial<Doctor> & { name: string }) {
    if (formDoctor) {
      await updateMutation.mutateAsync({ id: formDoctor.id, patch: data });
      onToast('Doctor updated');
    } else {
      await createMutation.mutateAsync(data);
      onToast('Doctor added');
    }
  }

  async function handleToggleActive(doctor: Doctor) {
    setBusyId(doctor.id);
    try {
      const next = doctor.isActive === false;
      await updateMutation.mutateAsync({
        id: doctor.id,
        patch: { isActive: next },
      });
      onToast(next ? 'Doctor activated' : 'Doctor deactivated');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update doctor', 'err');
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = doctors.filter((d) => d.isActive !== false).length;

  return (
    <div className="doctors-view">
      <div className="doctors-header">
        <div>
          <h3 className="doctors-title">Doctors</h3>
          <p className="doctors-sub">
            Manage doctors who see patients. Each doctor can have their own schedule.
          </p>
        </div>
        <div className="doctors-header-actions">
          <button
            type="button"
            className={`team-filter-btn${showInactive ? ' active' : ''}`}
            onClick={() => setShowInactive((v) => !v)}
          >
            {showInactive ? 'Hide inactive' : 'Show inactive'}
          </button>
          <button type="button" className="btn-primary" onClick={() => setFormDoctor(null)}>
            <Plus size={14} /> Add doctor
          </button>
        </div>
      </div>

      {error && (
        <div className="doctors-error">
          {error instanceof Error ? error.message : 'Could not load doctors'}
          <button type="button" className="btn-secondary btn-sm" onClick={() => refetch()}>Retry</button>
        </div>
      )}

      {isLoading ? (
        <div className="doctors-empty">Loading…</div>
      ) : doctors.length === 0 ? (
        <div className="doctors-empty">
          <Stethoscope size={28} strokeWidth={1.5} />
          <p>No doctors yet. Add your first doctor to get started.</p>
          <button type="button" className="btn-primary" onClick={() => setFormDoctor(null)}>
            <Plus size={14} /> Add doctor
          </button>
        </div>
      ) : (
        <>
          <div className="doctors-stats">
            {activeCount} active{doctors.length !== activeCount ? ` · ${doctors.length} total` : ''}
          </div>
          <div className="doctor-list">
            {doctors.map((doc) => (
              <DoctorCard
                key={doc.id}
                doctor={doc}
                onEdit={() => setFormDoctor(doc)}
                onToggleActive={() => handleToggleActive(doc)}
                onToast={onToast}
                busy={busyId === doc.id}
              />
            ))}
          </div>
        </>
      )}

      {formDoctor !== undefined && (
        <DoctorFormDialog
          doctor={formDoctor}
          onClose={() => setFormDoctor(undefined)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
