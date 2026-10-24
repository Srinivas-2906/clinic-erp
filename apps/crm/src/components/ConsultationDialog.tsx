import { useEffect, useState } from 'react';
import { X, FileText, Save, CheckCircle2 } from 'lucide-react';
import type { Appointment } from '../types';
import type { Encounter, PrescriptionItemInput, VitalInput } from '../types';
import {
  createEncounter,
  updateEncounter,
  finalizeEncounter,
  fetchEncounter,
  scheduleEncounterFollowUp,
  openPrescriptionPdf,
} from '../lib/api';
import { fetchMe } from '../lib/api';
import { useScrollLock } from '../hooks/useScrollLock';

interface Props {
  appointment: Appointment;
  onClose: () => void;
  onDone: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

const DEFAULT_VITALS: VitalInput[] = [
  { code: 'bp', value: '', unit: 'mmHg' },
  { code: 'pulse', value: '', unit: 'bpm' },
  { code: 'weight', value: '', unit: 'kg' },
];

export function ConsultationDialog({ appointment, onClose, onDone, onToast }: Props) {
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canSign, setCanSign] = useState(false);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [historySummary, setHistorySummary] = useState('');
  const [clinicalNote, setClinicalNote] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [vitals, setVitals] = useState<VitalInput[]>(DEFAULT_VITALS);
  const [rxLines, setRxLines] = useState<PrescriptionItemInput[]>([
    { drugName: '', dose: '', frequency: '', duration: '', instructions: '' },
  ]);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');

  useScrollLock(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await fetchMe();
        if (alive) setCanSign(!!(me.user as { canSignClinical?: boolean }).canSignClinical);
        const enc = await createEncounter(appointment.patientId, {
          appointmentId: appointment.id,
          doctorId: appointment.assignedDoctorId || undefined,
          chiefComplaint: appointment.notes || '',
        });
        if (!alive) return;
        applyEncounter(enc);
      } catch (e) {
        onToast(e instanceof Error ? e.message : 'Could not start consultation', 'err');
        onClose();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [appointment.id, appointment.patientId]);

  function applyEncounter(enc: Encounter) {
    setEncounter(enc);
    setChiefComplaint(enc.chiefComplaint || '');
    setHistorySummary(enc.historySummary || '');
    setClinicalNote(enc.clinicalNote || '');
    if (enc.diagnoses?.[0]?.description) setDiagnosis(enc.diagnoses[0].description);
    if (enc.vitals?.length) {
      setVitals(DEFAULT_VITALS.map((d) => {
        const hit = enc.vitals?.find((v) => v.code === d.code);
        return hit ? { ...d, value: hit.value, unit: hit.unit || d.unit } : d;
      }));
    }
    if (enc.prescription?.items?.length) {
      setRxLines(enc.prescription.items.map((i) => ({
        drugName: i.drugName,
        dose: i.dose,
        frequency: i.frequency,
        duration: i.duration,
        instructions: i.instructions,
      })));
    }
  }

  function buildPayload() {
    const filledVitals = vitals.filter((v) => v.value.trim());
    const items = rxLines.filter((l) => l.drugName.trim());
    return {
      chiefComplaint: chiefComplaint.trim(),
      historySummary: historySummary.trim(),
      clinicalNote: clinicalNote.trim(),
      vitals: filledVitals,
      diagnoses: diagnosis.trim() ? [{ description: diagnosis.trim(), isPrimary: true }] : [],
      prescriptionItems: items,
    };
  }

  async function saveDraft() {
    if (!encounter || saving) return;
    setSaving(true);
    try {
      const updated = await updateEncounter(encounter.id, buildPayload());
      setEncounter(updated);
      onToast('Consultation saved');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Save failed', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    if (!encounter || saving) return;
    if (!canSign) {
      onToast('Link your login to a doctor profile to finalize clinical records', 'err');
      return;
    }
    setSaving(true);
    try {
      await updateEncounter(encounter.id, buildPayload());
      const finalized = await finalizeEncounter(encounter.id);
      setEncounter(finalized);
      if (followUpDate) {
        await scheduleEncounterFollowUp(encounter.id, {
          dueDate: followUpDate,
          instructions: followUpNote.trim() || undefined,
          phone: appointment.patientPhone,
        });
      }
      onToast('Consultation finalized');
      onDone();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Finalize failed', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function openPdf() {
    if (!encounter) return;
    const fresh = await fetchEncounter(encounter.id);
    if (!fresh.prescription?.pdfStorageKey && fresh.status !== 'finalized') {
      onToast('Finalize to generate prescription PDF', 'err');
      return;
    }
    await openPrescriptionPdf(encounter.id);
  }

  const name = appointment.patientName || 'Patient';
  const readOnly = encounter?.status === 'finalized';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet modal-sheet-tall" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3>Consultation — {name}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body consultation-body">
          {loading ? (
            <p className="muted">Loading consultation…</p>
          ) : (
            <>
              {!canSign && !readOnly && (
                <p className="login-error" style={{ marginBottom: 12 }}>
                  View-only: your account is not linked to a doctor profile. Save drafts only; a clinician must finalize.
                </p>
              )}
              <div className="form-field">
                <label className="form-label" htmlFor="consult-complaint">Chief complaint</label>
                <input id="consult-complaint" className="form-input" value={chiefComplaint} disabled={readOnly} onChange={(e) => setChiefComplaint(e.target.value)} />
              </div>
              <div className="form-field">
                <label className="form-label">History</label>
                <textarea className="form-input" rows={2} value={historySummary} disabled={readOnly} onChange={(e) => setHistorySummary(e.target.value)} />
              </div>
              <div className="form-field">
                <label className="form-label">Vitals</label>
                <div className="form-row">
                  {vitals.map((v, i) => (
                    <div key={v.code} className="form-field" style={{ flex: 1 }}>
                      <label className="form-label">{v.code.toUpperCase()}</label>
                      <input
                        className="form-input"
                        value={v.value}
                        disabled={readOnly}
                        onChange={(e) => {
                          const next = [...vitals];
                          next[i] = { ...v, value: e.target.value };
                          setVitals(next);
                        }}
                        placeholder={v.unit}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="consult-diagnosis">Diagnosis</label>
                <input id="consult-diagnosis" className="form-input" value={diagnosis} disabled={readOnly} onChange={(e) => setDiagnosis(e.target.value)} />
              </div>
              <div className="form-field">
                <label className="form-label">Clinical notes</label>
                <textarea className="form-input" rows={3} value={clinicalNote} disabled={readOnly} onChange={(e) => setClinicalNote(e.target.value)} />
              </div>
              <div className="form-field">
                <label className="form-label">Prescription</label>
                {rxLines.map((line, i) => (
                  <div key={i} className="form-row" style={{ marginBottom: 8 }}>
                    <input className="form-input" placeholder="Medicine" value={line.drugName} disabled={readOnly} onChange={(e) => {
                      const next = [...rxLines];
                      next[i] = { ...line, drugName: e.target.value };
                      setRxLines(next);
                    }} />
                    <input className="form-input" placeholder="Dose" value={line.dose} disabled={readOnly} onChange={(e) => {
                      const next = [...rxLines];
                      next[i] = { ...line, dose: e.target.value };
                      setRxLines(next);
                    }} />
                  </div>
                ))}
                {!readOnly && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRxLines([...rxLines, { drugName: '', dose: '', frequency: '', duration: '', instructions: '' }])}>
                    + Add line
                  </button>
                )}
              </div>
              {!readOnly && (
                <div className="form-row">
                  <div className="form-field">
                    <label className="form-label">Follow-up date</label>
                    <input type="date" className="form-input" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Follow-up note</label>
                    <input className="form-input" value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          {encounter?.status === 'finalized' ? (
            <button type="button" className="btn btn-primary" onClick={() => void openPdf()}>
              <FileText size={16} /> Prescription PDF
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => void saveDraft()} disabled={saving || loading}>
                <Save size={16} /> Save draft
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void finalize()} disabled={saving || loading || !canSign}>
                <CheckCircle2 size={16} /> Finalize visit
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
