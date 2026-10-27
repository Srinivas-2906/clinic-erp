import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, MessageSquare, UserCheck, Clock, FileText, PlusCircle, Phone, Pencil, Banknote, Share2 } from 'lucide-react';
import type { Appointment, Patient, Payment, Encounter } from '../types';
import { fetchPatientAllergies, addPatientAllergy, updatePatientAllergy, deletePatientAllergy, openPrescriptionPdf, fetchMe, regeneratePrescriptionPdf } from '../lib/api';
import { EncounterAmendDialog } from './EncounterAmendDialog';
import { STATUS_LABELS } from '../types';
import { updatePatient, updateAppointment, fetchPatientPayments } from '../lib/api';
import { toTelUrl, toWhatsAppUrl } from '../lib/phone';
import { buildDoctorColorMap, doctorColorFor } from '../lib/doctorDisplay';
import { useDoctors } from '../hooks/useDoctors';
import { PatientFormDialog } from './PatientFormDialog';
import { RecordPaymentDialog } from './RecordPaymentDialog';
import { SharePaymentDialog } from './SharePaymentDialog';
import { DoctorBadge } from './DoctorBadge';
import { AuthenticatedClinicRecordThumb } from './AuthenticatedClinicRecordThumb';
import type { ClinicProfile } from '../lib/clinicBranding';

const PALETTES: [string, string][] = [
  ['#1565C0','#e3f0fd'],['#0369a1','#e0f2fe'],['#7c3aed','#f5f3ff'],
  ['#059669','#ecfdf5'],['#b45309','#fef3c7'],['#be185d','#fce7f3'],['#0f766e','#ccfbf1'],
];
function ava(name: string): [string, string] { return PALETTES[name.charCodeAt(0) % PALETTES.length]; }

const TAG_CLASS: Record<string, string> = {
  requested:'tag tag-warning', confirmed:'tag tag-brand', arrived:'tag tag-purple',
  visited:'tag tag-success',   cancelled:'tag tag-muted', no_show:'tag tag-muted',
};

/* ═══════════════════════════════════════════
   PATIENT DETAIL
═══════════════════════════════════════════ */
type DetailTab = 'overview' | 'history' | 'notes';

interface Props {
  patient: Patient;
  appointments: Appointment[];
  encounters?: Encounter[];
  clinicProfile: ClinicProfile;
  onBack: () => void;
  onUpdated: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
  onBookFollowup?: (patient: Patient) => void;
  canRecordPayments?: boolean;
}

export function PatientDetail({ patient, appointments, encounters = [], clinicProfile, onBack, onUpdated, onToast, onBookFollowup, canRecordPayments = true }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [note,    setNote]    = useState('');
  const [saving,  setSaving]  = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [sharePayment, setSharePayment] = useState<Payment | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [allergies, setAllergies] = useState<{ id: string; substance: string; severity?: string }[]>([]);
  const [allergyInput, setAllergyInput] = useState('');
  const [allergySeverity, setAllergySeverity] = useState('');
  const [allergySaving, setAllergySaving] = useState(false);
  const [editingAllergyId, setEditingAllergyId] = useState<string | null>(null);
  const [canSignClinical, setCanSignClinical] = useState(false);
  const [amendEncounter, setAmendEncounter] = useState<Encounter | null>(null);
  const [fg, bg] = ava(patient.name);
  const telUrl = toTelUrl(patient.phone);
  const waUrl = toWhatsAppUrl(patient.phone);

  const { data: doctorsList = [] } = useDoctors(false);
  const activeDoctors = useMemo(
    () => doctorsList.filter((d) => d.isActive !== false),
    [doctorsList],
  );
  const doctorColorById = useMemo(() => buildDoctorColorMap(activeDoctors), [activeDoctors]);

  const visited = appointments
    .filter((a) => a.status === 'visited')
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  const nowTs = Date.now();
  const upcomingSorted = appointments
    .filter((a) => a.status === 'confirmed' || a.status === 'arrived' || a.status === 'requested')
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  // "Next visit" should be future-only; past-but-not-completed is shown as "Overdue".
  const nextAppt = upcomingSorted.find((a) => new Date(a.scheduledAt).getTime() >= nowTs) || null;
  const overdueAppt = upcomingSorted.find((a) => new Date(a.scheduledAt).getTime() < nowTs) || null;
  const lastVisit = visited[0] || null;
  const lastDoctor = lastVisit?.assignedDoctor || null;

  useEffect(() => {
    let alive = true;
    fetchPatientPayments(patient.id)
      .then((data) => { if (alive) setPayments(data.payments || []); })
      .catch(() => { if (alive) setPayments([]); });
    fetchPatientAllergies(patient.id)
      .then((data) => { if (alive) setAllergies(data.allergies || []); })
      .catch(() => { if (alive) setAllergies([]); });
    fetchMe()
      .then((m) => { if (alive) setCanSignClinical(!!m.user?.canSignClinical); })
      .catch(() => { if (alive) setCanSignClinical(false); });
    return () => { alive = false; };
  }, [patient.id]);

  async function submitAllergy() {
    const substance = allergyInput.trim();
    if (!substance) return;
    setAllergySaving(true);
    try {
      if (editingAllergyId) {
        const row = await updatePatientAllergy(patient.id, editingAllergyId, {
          substance,
          severity: allergySeverity.trim() || undefined,
        });
        setAllergies((prev) => prev.map((a) => (a.id === editingAllergyId ? { ...a, ...row } : a)));
        setEditingAllergyId(null);
        onToast('Allergy updated');
      } else {
        const row = await addPatientAllergy(patient.id, {
          substance,
          severity: allergySeverity.trim() || undefined,
        });
        setAllergies((prev) => [...prev, row]);
        onToast('Allergy saved');
      }
      setAllergyInput('');
      setAllergySeverity('');
    } catch {
      onToast('Could not save allergy', 'err');
    } finally {
      setAllergySaving(false);
    }
  }

  async function removeAllergy(id: string) {
    try {
      await deletePatientAllergy(patient.id, id);
      setAllergies((prev) => prev.filter((a) => a.id !== id));
      if (editingAllergyId === id) {
        setEditingAllergyId(null);
        setAllergyInput('');
        setAllergySeverity('');
      }
      onToast('Allergy removed');
    } catch {
      onToast('Could not remove allergy', 'err');
    }
  }

  function refreshPayments() {
    onUpdated();
    fetchPatientPayments(patient.id)
      .then((data) => setPayments(data.payments || []))
      .catch(() => setPayments([]));
  }

  async function addNote() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await updatePatient(patient.id, { note: note.trim() });
      setNote(''); onUpdated();
      onToast('Note saved');
    } catch { onToast('Could not save note', 'err'); }
    finally { setSaving(false); }
  }

  async function confirmAppt(id: string) {
    try {
      await updateAppointment(id, { status: 'confirmed' as Appointment['status'] });
      onUpdated(); onToast('Booking confirmed');
    } catch { onToast('Could not save', 'err'); }
  }

  const TABS: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Details' },
    { id: 'history',  label: `Visits (${appointments.length + encounters.length})` },
    { id: 'notes',    label: `Notes (${(patient.notes||[]).length})` },
  ];

  return (
    <div className="patient-detail">
      {/* Hero header */}
      <div className="detail-hero">
        <button type="button" className="detail-back" onClick={onBack} aria-label="Back">
          <ChevronLeft size={16} />
        </button>
        <div className="detail-ava" style={{ background: bg, color: fg }}>
          {patient.name.charAt(0).toUpperCase()}
        </div>
        <div className="detail-hero-info">
          <div className="detail-hero-name">{patient.name}</div>
          <div className="detail-hero-phone">{patient.phone}</div>
          <div className="detail-hero-tags">
            {patient.age && <span className="detail-hero-tag">Age {patient.age}</span>}
            {patient.gender && <span className="detail-hero-tag">{patient.gender}</span>}
            {patient.isReturning ? <span className="detail-hero-tag">Returning</span> : <span className="detail-hero-tag">New</span>}
            {patient.source && <span className="detail-hero-tag">{patient.source}</span>}
          </div>
        </div>
        {/* Quick contact */}
        <div className="detail-hero-contact">
          <button type="button" className="quick-action-btn quick-action-light" title="Edit" onClick={() => setShowEdit(true)}><Pencil size={14} /></button>
          {telUrl && <a href={telUrl} className="quick-action-btn quick-action-light" title="Call"><Phone size={14} /></a>}
          {waUrl && <a href={waUrl} target="_blank" rel="noreferrer" className="quick-action-btn quick-action-wa" title="WhatsApp"><MessageSquare size={14} /></a>}
        </div>
      </div>

      {showEdit && (
        <PatientFormDialog
          patient={patient}
          onClose={() => setShowEdit(false)}
          onToast={onToast}
          onSaved={() => { setShowEdit(false); onUpdated(); }}
        />
      )}

      {showPay && (
        <RecordPaymentDialog
          patients={[patient]}
          prefillPatientId={patient.id}
          onClose={() => setShowPay(false)}
          onSaved={refreshPayments}
          onToast={onToast}
        />
      )}

      {amendEncounter && (
        <EncounterAmendDialog
          encounter={amendEncounter}
          onClose={() => setAmendEncounter(null)}
          onSaved={onUpdated}
          onToast={onToast}
        />
      )}

      {sharePayment && (
        <SharePaymentDialog
          payment={sharePayment}
          patientName={patient.name}
          patientPhone={patient.phone}
          clinic={clinicProfile}
          onClose={() => setSharePayment(null)}
          onToast={onToast}
        />
      )}

      {/* Tab bar */}
      <div className="detail-tabs">
        {TABS.map(t => (
          <button key={t.id} type="button"
            className={`detail-tab${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="detail-body">

        {/* ── Overview tab ── */}
        {activeTab === 'overview' && (
          <>
            {/* Key info */}
            <div className="panel">
              <div className="panel-head">
                <UserCheck size={14} color="var(--brand)" />
                <span className="panel-title">About patient</span>
              </div>
              <div className="panel-body">
                <div className="info-grid" style={{ marginBottom: 16 }}>
                  <dl className="info-item">
                    <dt>Problem</dt>
                    <dd>{patient.chiefComplaint || '—'}</dd>
                  </dl>
                  <dl className="info-item">
                    <dt>Visits done</dt>
                    <dd>{visited.length}</dd>
                  </dl>
                  <dl className="info-item">
                    <dt>Last visit</dt>
                    <dd>{lastVisit ? new Date(lastVisit.scheduledAt).toLocaleDateString('en-IN') : 'Never'}</dd>
                  </dl>
                  {lastDoctor && (
                    <dl className="info-item">
                      <dt>Last doctor</dt>
                      <dd>
                        <DoctorBadge
                          name={lastDoctor}
                          color={lastVisit ? doctorColorFor(lastVisit, doctorColorById) : undefined}
                        />
                      </dd>
                    </dl>
                  )}
                  <dl className="info-item">
                    <dt>Next visit</dt>
                    <dd style={{ color: nextAppt ? 'var(--brand)' : 'var(--muted)' }}>
                      {nextAppt ? (
                        new Date(nextAppt.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      ) : overdueAppt ? (
                        <>Overdue · {new Date(overdueAppt.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>
                      ) : (
                        'None'
                      )}
                    </dd>
                  </dl>
                  <dl className="info-item">
                    <dt>Joined</dt>
                    <dd>{patient.createdAt ? new Date(patient.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}</dd>
                  </dl>
                  <dl className="info-item">
                    <dt>Source</dt>
                    <dd>{patient.source || '—'}</dd>
                  </dl>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {waUrl && (
                    <a href={waUrl} target="_blank" rel="noreferrer" className="chat-btn" style={{ flex: 1 }}>
                      <MessageSquare size={14} /> WhatsApp
                    </a>
                  )}
                  {onBookFollowup && (
                    <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => onBookFollowup(patient)}>
                      <PlusCircle size={13} /> Book again
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Allergies */}
            <div className="panel">
              <div className="panel-head">
                <FileText size={14} color="var(--brand)" />
                <span className="panel-title">Allergies</span>
              </div>
              <div className="panel-body">
                {allergies.length === 0 ? (
                  <p className="muted" style={{ marginBottom: 12 }}>No allergies recorded.</p>
                ) : (
                  <ul className="allergy-list" style={{ marginBottom: 12 }}>
                    {allergies.map((a) => (
                      <li key={a.id} className="allergy-chip allergy-chip-row">
                        <span>
                          <strong>{a.substance}</strong>
                          {a.severity ? <span className="muted"> · {a.severity}</span> : null}
                        </span>
                        <span className="allergy-chip-actions">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                            setEditingAllergyId(a.id);
                            setAllergyInput(a.substance);
                            setAllergySeverity(a.severity || '');
                          }}>Edit</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void removeAllergy(a.id)}>Remove</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="form-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <input
                    className="form-input"
                    style={{ flex: '1 1 140px', minWidth: 0 }}
                    placeholder="Substance"
                    value={allergyInput}
                    onChange={(e) => setAllergyInput(e.target.value)}
                  />
                  <input
                    className="form-input"
                    style={{ flex: '0 1 100px', minWidth: 0 }}
                    placeholder="Severity"
                    value={allergySeverity}
                    onChange={(e) => setAllergySeverity(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={allergySaving || !allergyInput.trim()}
                    onClick={() => void submitAllergy()}
                  >
                    {editingAllergyId ? 'Update' : 'Add'}
                  </button>
                  {editingAllergyId && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                      setEditingAllergyId(null);
                      setAllergyInput('');
                      setAllergySeverity('');
                    }}>Cancel edit</button>
                  )}
                </div>
              </div>
            </div>

            {/* Payments */}
            <div className="panel">
              <div className="panel-head">
                <Banknote size={14} color="var(--brand)" />
                <span className="panel-title">Payments</span>
                {canRecordPayments && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowPay(true)}>
                    + Record
                  </button>
                )}
              </div>
              <div className="panel-body">
                <div className="patient-payment-summary">
                  <div className="patient-payment-stat">
                    <span className="patient-payment-stat-label">Total paid</span>
                    <strong>{patient.totalPaid ? `₹${patient.totalPaid.toLocaleString('en-IN')}` : '—'}</strong>
                  </div>
                  <div className="patient-payment-stat">
                    <span className="patient-payment-stat-label">Last payment</span>
                    <strong>
                      {patient.lastPaymentAmount != null && patient.lastPaymentAmount > 0
                        ? `₹${patient.lastPaymentAmount.toLocaleString('en-IN')}`
                        : '—'}
                    </strong>
                  </div>
                </div>
                {payments.length === 0 ? (
                  <p className="muted" style={{ marginTop: 12 }}>No payments recorded yet.</p>
                ) : (
                  <ul className="payment-list patient-payment-list">
                    {payments.map((pay) => (
                      <li key={pay.id} className="payment-row payment-row-static">
                        <div>
                          <strong>₹{pay.amount.toLocaleString('en-IN')} · {pay.method}</strong>
                          {pay.notes && <span>{pay.notes}</span>}
                          {pay.reference && <span className="ref">{pay.reference}</span>}
                        </div>
                        <div className="payment-row-end">
                          <small>{pay.createdAt ? new Date(pay.createdAt).toLocaleDateString('en-IN') : ''}</small>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label="Share payment on WhatsApp"
                            title="Share receipt"
                            onClick={() => setSharePayment(pay)}
                          >
                            <Share2 size={16} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Reference images (records) */}
            {(() => {
              const urls = (patient.recordUrls && patient.recordUrls.length > 0)
                ? patient.recordUrls
                : (patient.prescriptionUrl || patient.photoUrl)
                  ? [patient.prescriptionUrl || patient.photoUrl]
                  : [];
              if (!urls.length) return null;
              return (
                <div className="panel">
                  <div className="panel-head">
                    <FileText size={14} color="var(--brand)" />
                    <span className="panel-title">Records</span>
                    <span className="muted" style={{ fontSize: 12 }}>{urls.length}</span>
                  </div>
                  <div className="panel-body">
                    <div className="record-grid">
                      {urls.filter((u): u is string => Boolean(u)).map((u, i) => (
                        <AuthenticatedClinicRecordThumb
                          key={`${u}-${i}`}
                          url={u}
                          alt={`Record ${i + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {overdueAppt && (
              <div className="panel">
                <div className="panel-head">
                  <Clock size={14} color="var(--brand)" />
                  <span className="panel-title">Overdue appointment</span>
                  <span className={TAG_CLASS[overdueAppt.status]}>{STATUS_LABELS[overdueAppt.status]}</span>
                </div>
                <div className="panel-body">
                  <div className="info-grid">
                    <dl className="info-item">
                      <dt>When</dt>
                      <dd>{new Date(overdueAppt.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</dd>
                    </dl>
                    <dl className="info-item">
                      <dt>What for</dt>
                      <dd>{overdueAppt.service}</dd>
                    </dl>
                    {overdueAppt.assignedDoctor && (
                      <dl className="info-item">
                        <dt>Doctor</dt>
                        <dd>
                          <DoctorBadge
                            name={overdueAppt.assignedDoctor}
                            color={doctorColorFor(overdueAppt, doctorColorById)}
                          />
                        </dd>
                      </dl>
                    )}
                  </div>
                  {overdueAppt.status === 'requested' && (
                    <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => confirmAppt(overdueAppt.id)}>
                      Confirm booking
                    </button>
                  )}
                </div>
              </div>
            )}

            {nextAppt && (
              <div className="panel">
                <div className="panel-head">
                  <Clock size={14} color="var(--brand)" />
                  <span className="panel-title">Next visit</span>
                  <span className={TAG_CLASS[nextAppt.status]}>{STATUS_LABELS[nextAppt.status]}</span>
                </div>
                <div className="panel-body">
                  <div className="info-grid">
                    <dl className="info-item">
                      <dt>When</dt>
                      <dd>{new Date(nextAppt.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</dd>
                    </dl>
                    <dl className="info-item">
                      <dt>What for</dt>
                      <dd>{nextAppt.service}</dd>
                    </dl>
                    {nextAppt.assignedDoctor && (
                      <dl className="info-item">
                        <dt>Doctor</dt>
                        <dd>
                          <DoctorBadge
                            name={nextAppt.assignedDoctor}
                            color={doctorColorFor(nextAppt, doctorColorById)}
                          />
                        </dd>
                      </dl>
                    )}
                  </div>
                  {nextAppt.status === 'requested' && (
                    <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => confirmAppt(nextAppt.id)}>
                      Confirm booking
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── History tab ── */}
        {activeTab === 'history' && (
          <div className="panel">
            <div className="panel-head">
              <Clock size={14} color="var(--brand)" />
              <span className="panel-title">Visit history</span>
            </div>
            <div className="panel-body">
              {encounters.length > 0 && (
                <ul className="mini-appt-list" style={{ marginBottom: 16 }}>
                  {encounters.map((enc) => (
                    <li key={enc.id} className="mini-appt-row">
                      <div>
                        <div className="mini-appt-date">
                          {enc.finalizedAt
                            ? new Date(enc.finalizedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                            : new Date(enc.createdAt || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium' })}
                        </div>
                        <div className="mini-appt-svc">{enc.chiefComplaint || 'Consultation'}</div>
                        <span className={`tag ${enc.status === 'finalized' ? 'tag-success' : 'tag-warning'}`}>
                          {enc.status}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                        {enc.status === 'finalized' && canSignClinical && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAmendEncounter(enc)}>
                            Amend
                          </button>
                        )}
                        {enc.status === 'finalized' && enc.prescription?.pdfStorageKey && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openPrescriptionPdf(enc.id).catch(() => onToast('PDF unavailable', 'err'))}>
                            Rx PDF
                          </button>
                        )}
                        {enc.status === 'finalized' && canSignClinical && enc.prescription?.items?.length && !enc.prescription?.pdfStorageKey && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              regeneratePrescriptionPdf(enc.id)
                                .then(() => { onToast('PDF regenerated'); onUpdated(); })
                                .catch(() => onToast('PDF retry failed', 'err'));
                            }}
                          >
                            Retry PDF
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {appointments.length === 0 && encounters.length === 0 ? (
                <p className="muted">No visits yet.</p>
              ) : appointments.length > 0 ? (
                <ul className="mini-appt-list">
                  {[...appointments].sort((a,b)=>new Date(b.scheduledAt).getTime()-new Date(a.scheduledAt).getTime()).map((a) => (
                    <li key={a.id} className="mini-appt-row">
                      <div style={{ minWidth: 0 }}>
                        <div className="mini-appt-date">
                          {new Date(a.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                        <div className="mini-appt-svc">{a.service}</div>
                        {a.assignedDoctor && (
                          <div className="mini-appt-doctor">
                            <DoctorBadge
                              name={a.assignedDoctor}
                              color={doctorColorFor(a, doctorColorById)}
                              compact
                            />
                          </div>
                        )}
                        {a.source && <div className="mini-appt-svc" style={{ color: 'var(--muted)', fontSize: 11 }}>from {a.source}</div>}
                        <span className={TAG_CLASS[a.status] || 'tag tag-muted'} style={{ marginTop: 5, display: 'inline-flex' }}>
                          {STATUS_LABELS[a.status]}
                        </span>
                      </div>
                      {a.status === 'requested' && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => confirmAppt(a.id)}>Confirm</button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        )}

        {/* ── Notes tab ── */}
        {activeTab === 'notes' && (
          <div className="panel">
            <div className="panel-head">
              <FileText size={14} color="var(--brand)" />
              <span className="panel-title">Notes</span>
            </div>
            <div className="panel-body">
              <div className="note-form">
                <textarea
                  rows={3}
                  placeholder="Write a note for the team…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="note-form-row">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={saving || !note.trim()}
                    onClick={addNote}
                  >
                    <PlusCircle size={12} /> Save note
                  </button>
                </div>
              </div>
              {(patient.notes || []).length === 0 && !note && (
                <p className="muted" style={{ marginTop: 12 }}>No notes yet.</p>
              )}
              {(patient.notes || []).length > 0 && (
                <div className="notes-timeline">
                  {(patient.notes || []).map((n, i) => (
                    <div key={i} className="note-item">
                      <p>{n.text}</p>
                      <small>{n.by} · {new Date(n.at).toLocaleString('en-IN')}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { BookView } from './BookView';
