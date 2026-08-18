import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  ChevronRight,
  Stethoscope,
  UserPlus,
  Zap,
} from 'lucide-react';
import type { Appointment, CatalogItem, Patient } from '../types';
import {
  createAppointment,
  createPatient,
  fetchAvailableSlots,
  fetchCatalog,
  fetchClient,
  fetchPatient,
  fetchPatientPayments,
  fetchPatients,
  updatePatient,
} from '../lib/api';
import { useDoctors } from '../hooks/useDoctors';
import { BookDoctorPicker, type DoctorChoice } from './BookDoctorPicker';
import {
  buildSlotOptions,
  formatSlotOptionLabel,
  slotOptionKey,
  type SlotOption,
} from '../lib/bookingSlots';
import { BOOKING_SERVICE_TITLES, DEFAULT_BOOKING_SERVICE } from '../lib/bookingServices';
import {
  formatPhone10,
  isValidAge,
  isValidPatientName,
  isValidPhone10,
  sanitizeAge,
  sanitizePhoneDigits,
} from '../lib/patientInput';

const PALETTES: [string, string][] = [
  ['#1565C0', '#e3f0fd'], ['#0369a1', '#e0f2fe'], ['#7c3aed', '#f5f3ff'],
  ['#059669', '#ecfdf5'], ['#b45309', '#fef3c7'], ['#be185d', '#fce7f3'], ['#0f766e', '#ccfbf1'],
];

function ava(name: string): [string, string] {
  return PALETTES[name.charCodeAt(0) % PALETTES.length];
}

function parseSlotLabel(label: string): string | null {
  const m = label.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || '0');
  const period = (m[3] || '').toUpperCase();
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function fmtVisitDate(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function nowIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}:00`;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

type BookMode = 'schedule' | 'walkin';
type BookStep = 'lookup' | 'patient' | 'treatment' | 'doctor' | 'schedule' | 'confirm';

interface PatientContext {
  visitCount: number;
  lastVisitDate: string | null;
  lastTreatment: string | null;
  lastDoctor: string | null;
  outstanding: number;
  loading: boolean;
}

interface BookProps {
  onBooked: (scheduledAt: string) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
  prefillPatient?: Patient | null;
  onCancelPrefill?: () => void;
}

function isPhoneQuery(q: string) {
  const digits = sanitizePhoneDigits(q);
  return digits.length > 0 && digits.length >= q.replace(/\s/g, '').length * 0.8;
}

function buildContextFromTimeline(
  appointments: Appointment[],
  dueTotal: number,
): Omit<PatientContext, 'loading'> {
  const visited = appointments
    .filter((a) => a.status === 'visited')
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  const last = visited[0] || null;
  return {
    visitCount: visited.length,
    lastVisitDate: last ? fmtVisitDate(last.scheduledAt) : null,
    lastTreatment: last?.service || null,
    lastDoctor: last?.assignedDoctor || null,
    outstanding: dueTotal,
  };
}

function stepLabels(mode: BookMode, multiDoctor: boolean): string[] {
  const doctorStep = multiDoctor ? ['Doctor'] : [];
  if (mode === 'walkin') {
    return ['Patient', 'Treatment', ...doctorStep, 'Confirm'];
  }
  return ['Patient', 'Treatment', ...doctorStep, 'Schedule', 'Confirm'];
}

function stepToLabelIndex(step: BookStep, mode: BookMode, multiDoctor: boolean): number {
  if (step === 'lookup' || step === 'patient') return 0;
  if (step === 'treatment') return 1;
  if (step === 'doctor') return 2;
  if (step === 'schedule') return multiDoctor ? 3 : 2;
  return multiDoctor ? (mode === 'walkin' ? 3 : 4) : (mode === 'walkin' ? 2 : 3);
}

function nextAfterTreatment(mode: BookMode, multiDoctor: boolean): BookStep {
  if (multiDoctor) return 'doctor';
  return mode === 'walkin' ? 'confirm' : 'schedule';
}

function nextAfterDoctor(mode: BookMode): BookStep {
  return mode === 'walkin' ? 'confirm' : 'schedule';
}

function backFromSchedule(multiDoctor: boolean): BookStep {
  return multiDoctor ? 'doctor' : 'treatment';
}

function backFromConfirm(mode: BookMode, multiDoctor: boolean): BookStep {
  if (mode === 'walkin') return multiDoctor ? 'doctor' : 'treatment';
  return 'schedule';
}

function doctorDisplayName(
  doctors: { id: string; name: string; displayName?: string | null }[],
  doctorId: string,
  fallback = '',
) {
  const doc = doctors.find((d) => d.id === doctorId);
  return doc?.displayName || doc?.name || fallback;
}

function BookStepNav({
  labels,
  activeIndex,
}: {
  labels: string[];
  activeIndex: number;
}) {
  return (
    <nav className="book-step-nav" aria-label="Booking progress">
      {labels.map((label, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={label} className={`book-step-nav-item${done ? ' done' : ''}${active ? ' active' : ''}`}>
            <span className="book-step-nav-marker">
              {done ? <Check size={12} strokeWidth={3} /> : active ? '●' : '○'}
            </span>
            <span className="book-step-nav-label">{done ? `${label} ✓` : label}</span>
            {i < labels.length - 1 && <span className="book-step-nav-sep" aria-hidden="true" />}
          </div>
        );
      })}
    </nav>
  );
}

function PatientContextCard({
  patient,
  ctx,
  defaultDoctor,
  onContinue,
  compact,
}: {
  patient: Patient;
  ctx: PatientContext | null;
  defaultDoctor: string;
  onContinue: () => void;
  compact?: boolean;
}) {
  const [fg, bg] = ava(patient.name);
  return (
    <div className={`book-patient-found${compact ? ' compact' : ''}`}>
      <div className="book-patient-found-head">
        <div className="found-patient-ava" style={{ background: bg, color: fg }}>
          {patient.name.charAt(0).toUpperCase()}
        </div>
        <div className="book-patient-found-title">
          <span className="book-patient-badge">✓ Returning patient</span>
          <div className="found-patient-name">{patient.name}</div>
          <div className="found-patient-meta">{patient.phone}</div>
        </div>
      </div>

      {ctx?.loading ? (
        <p className="book-patient-context-loading">Loading history…</p>
      ) : ctx ? (
        <dl className="book-patient-context-grid">
          {ctx.lastVisitDate && (
            <>
              <dt>Last visit</dt>
              <dd>{ctx.lastVisitDate}</dd>
            </>
          )}
          {ctx.visitCount > 0 && (
            <>
              <dt>Visits</dt>
              <dd>{ctx.visitCount}</dd>
            </>
          )}
          {ctx.outstanding > 0 && (
            <>
              <dt>Outstanding</dt>
              <dd className="book-outstanding">₹{ctx.outstanding.toLocaleString('en-IN')}</dd>
            </>
          )}
          {(ctx.lastDoctor || defaultDoctor) && (
            <>
              <dt>Last doctor</dt>
              <dd>{ctx.lastDoctor || defaultDoctor}</dd>
            </>
          )}
          {ctx.lastTreatment && (
            <>
              <dt>Last treatment</dt>
              <dd>{ctx.lastTreatment}</dd>
            </>
          )}
          {!ctx.lastVisitDate && ctx.visitCount === 0 && (
            <>
              <dt>History</dt>
              <dd>No completed visits yet</dd>
            </>
          )}
        </dl>
      ) : null}

      {!compact && (
        <button type="button" className="btn btn-primary btn-block book-continue-btn" onClick={onContinue}>
          Continue booking <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}

export function BookView({ onBooked, onToast, prefillPatient, onCancelPrefill }: BookProps) {
  const [mode, setMode] = useState<BookMode>('schedule');
  const [step, setStep] = useState<BookStep>(prefillPatient ? 'treatment' : 'lookup');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [foundPatient, setFoundPatient] = useState<Patient | null>(prefillPatient || null);
  const [patientContext, setPatientContext] = useState<PatientContext | null>(null);
  const [defaultDoctor, setDefaultDoctor] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [service, setService] = useState(DEFAULT_BOOKING_SERVICE);
  const [serviceId, setServiceId] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [slot, setSlot] = useState('');
  const [slotKey, setSlotKey] = useState('');
  const [slotOptions, setSlotOptions] = useState<SlotOption[]>([]);
  const [doctorChoice, setDoctorChoice] = useState<DoctorChoice>('any');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchGen = useRef(0);

  const { data: doctorsList = [] } = useDoctors(false);
  const activeDoctors = useMemo(
    () => doctorsList.filter((d) => d.isActive !== false),
    [doctorsList],
  );
  const multiDoctor = activeDoctors.length > 1;
  const labels = stepLabels(mode, multiDoctor);
  const activeLabelIndex = stepToLabelIndex(step, mode, multiDoctor);
  const showDoctorOnSlots = multiDoctor && doctorChoice === 'any';

  const resolvedDoctorId = useMemo(() => {
    if (doctorChoice !== 'any') return doctorChoice;
    const picked = slotOptions.find((o) => slotOptionKey(o) === slotKey);
    return picked?.doctorId || activeDoctors[0]?.id || '';
  }, [doctorChoice, slotKey, slotOptions, activeDoctors]);

  const selectedSlot = useMemo(
    () => slotOptions.find((o) => slotOptionKey(o) === slotKey) || null,
    [slotOptions, slotKey],
  );

  const confirmDoctorLabel = useMemo(() => {
    if (!multiDoctor) {
      return defaultDoctor || doctorDisplayName(activeDoctors, activeDoctors[0]?.id || '');
    }
    if (mode === 'walkin') {
      if (doctorChoice === 'any') return 'Any available';
      return doctorDisplayName(activeDoctors, doctorChoice);
    }
    if (doctorChoice === 'any') {
      return selectedSlot?.doctorName || 'Any available';
    }
    return doctorDisplayName(activeDoctors, doctorChoice);
  }, [multiDoctor, defaultDoctor, activeDoctors, mode, doctorChoice, selectedSlot]);

  useEffect(() => {
    if (activeDoctors.length === 1) {
      setDoctorChoice(activeDoctors[0].id);
    }
  }, [activeDoctors]);

  useEffect(() => {
    fetchClient()
      .then((c) => { if (c?.doctorName) setDefaultDoctor(c.doctorName); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  useEffect(() => {
    let alive = true;
    fetchCatalog()
      .then((d: unknown) => {
        if (!alive) return;
        const items: CatalogItem[] = Array.isArray(d) ? d : ((d as { items?: CatalogItem[] })?.items || []);
        const clean = items.filter((it) => it?.title).map((it) => ({
          ...it,
          priceNum: (it as CatalogItem & { price_num?: number }).priceNum ?? (it as CatalogItem & { price_num?: number }).price_num,
        }));
        setCatalogItems(clean);
        if (clean.length > 0) {
          const defaultItem = clean.find((it) => it.title === DEFAULT_BOOKING_SERVICE) || clean[0];
          setService(defaultItem.title);
          setServiceId(defaultItem.id);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const servicesList = useMemo(() => {
    const items = catalogItems.filter((it) => {
      const s = String(it.status || '').toLowerCase();
      return !s || !['inactive', 'disabled', 'archived'].includes(s);
    });
    if (items.length) return items;
    return BOOKING_SERVICE_TITLES.map((title, i) => ({
      id: `fallback-${i}`,
      title,
      category: '',
    })) as CatalogItem[];
  }, [catalogItems]);

  const selectedCatalog = useMemo(
    () => (serviceId ? servicesList.find((s) => s.id === serviceId) || null : null),
    [servicesList, serviceId],
  );

  useEffect(() => {
    if (mode === 'walkin' || step !== 'schedule') return;
    let alive = true;
    setLoadingSlots(true);

    const fetchOpts = {
      doctorId: doctorChoice !== 'any' ? doctorChoice : undefined,
      anyAvailable: doctorChoice === 'any',
      serviceId: serviceId && !serviceId.startsWith('fallback-') ? serviceId : undefined,
    };

    fetchAvailableSlots(date, fetchOpts)
      .then((d) => {
        if (!alive) return;
        const options = buildSlotOptions(
          d?.slots || [],
          d?.slotOptions,
          doctorChoice !== 'any' ? doctorChoice : undefined,
        );
        setSlotOptions(options);
        const first = options[0];
        if (first) {
          const key = slotOptionKey(first);
          setSlotKey((prev) => (options.some((o) => slotOptionKey(o) === prev) ? prev : key));
          setSlot(first.label);
        } else {
          setSlotKey('');
          setSlot('');
        }
      })
      .catch(() => {
        if (alive) {
          setSlotOptions([]);
          setSlotKey('');
          setSlot('');
        }
      })
      .finally(() => { if (alive) setLoadingSlots(false); });
    return () => { alive = false; };
  }, [date, mode, step, doctorChoice, serviceId, activeDoctors.length]);

  const loadPatientContext = useCallback(async (patient: Patient) => {
    setPatientContext({ visitCount: 0, lastVisitDate: null, lastTreatment: null, lastDoctor: null, outstanding: 0, loading: true });
    try {
      const [timeline, paymentsData] = await Promise.all([
        fetchPatient(patient.id),
        fetchPatientPayments(patient.id),
      ]);
      const dueTotal = (paymentsData.payments || [])
        .filter((p) => p.status === 'due')
        .reduce((s, p) => s + (p.amount || 0), 0);
      setPatientContext({
        ...buildContextFromTimeline(timeline.appointments || [], dueTotal),
        loading: false,
      });
    } catch {
      setPatientContext(null);
    }
  }, []);

  const selectPatient = useCallback((patient: Patient) => {
    setFoundPatient(patient);
    setAge(patient.age != null ? String(patient.age) : '');
    setPhone(sanitizePhoneDigits(patient.phone));
    void loadPatientContext(patient);
  }, [loadPatientContext]);

  useEffect(() => {
    if (prefillPatient) {
      setFoundPatient(prefillPatient);
      setStep('treatment');
      setSearchQuery('');
      setError('');
      void loadPatientContext(prefillPatient);
    }
  }, [prefillPatient, loadPatientContext]);

  // Auto-search as user types (lookup step only)
  useEffect(() => {
    if (step !== 'lookup') return;

    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchDone(false);
      setFoundPatient(prefillPatient || null);
      return;
    }

    const phoneMode = isPhoneQuery(q);
    if (phoneMode && sanitizePhoneDigits(q).length < 6) {
      setSearchDone(false);
      return;
    }

    const gen = ++searchGen.current;
    setSearching(true);
    setSearchDone(false);

    const timer = window.setTimeout(async () => {
      try {
        const results = await fetchPatients(q);
        if (gen !== searchGen.current) return;

        setSearchResults(results);
        setSearchDone(true);

        if (results.length === 1) {
          selectPatient(results[0]);
        } else if (results.length === 0 && phoneMode && sanitizePhoneDigits(q).length === 10) {
          setFoundPatient(null);
          setPatientContext(null);
          setPhone(sanitizePhoneDigits(q));
        } else if (results.length > 1) {
          setFoundPatient(null);
          setPatientContext(null);
        }
      } catch {
        if (gen === searchGen.current) {
          setSearchResults([]);
          setSearchDone(true);
        }
      } finally {
        if (gen === searchGen.current) setSearching(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchQuery, step, selectPatient]);

  const returningAgeValid = foundPatient
    ? (foundPatient.age != null && foundPatient.age > 0) || isValidAge(age) || mode === 'walkin'
    : true;

  function continueFromLookup() {
    if (foundPatient) {
      setStep('treatment');
      return;
    }
    if (!phone && isPhoneQuery(searchQuery)) {
      setPhone(sanitizePhoneDigits(searchQuery));
    }
    setStep('patient');
  }

  function goToTreatmentNext() {
    setStep(nextAfterTreatment(mode, multiDoctor));
  }

  function goBackFromTreatment() {
    if (prefillPatient && onCancelPrefill) {
      onCancelPrefill();
      return;
    }
    if (foundPatient && !prefillPatient) {
      setStep('lookup');
      return;
    }
    setStep('patient');
  }

  async function submit() {
    if (!returningAgeValid && mode !== 'walkin') {
      setError('Age is required');
      onToast('Add patient age to continue', 'err');
      return;
    }

    let scheduledAt: string;
    if (mode === 'walkin') {
      scheduledAt = nowIsoLocal();
    } else {
      const time = selectedSlot?.time || parseSlotLabel(slot);
      if (!time) {
        setError('Please pick a time slot');
        onToast('Please pick a time slot', 'err');
        return;
      }
      scheduledAt = `${date}T${time}:00`;
    }

    const assignedDoctorId = mode === 'walkin'
      ? (doctorChoice !== 'any' ? doctorChoice : activeDoctors[0]?.id)
      : resolvedDoctorId;

    if (multiDoctor && !assignedDoctorId) {
      setError('Please select a doctor');
      onToast('Please select a doctor', 'err');
      return;
    }

    setLoading(true);
    setError('');
    try {
      let patient: Patient;
      if (foundPatient) {
        if ((foundPatient.age == null || foundPatient.age <= 0) && isValidAge(age)) {
          patient = await updatePatient(foundPatient.id, { age: Number(age) });
        } else {
          patient = foundPatient;
        }
      } else {
        patient = await createPatient({
          name: name.trim(),
          phone: formatPhone10(phone),
          age: isValidAge(age) ? Number(age) : undefined,
          chiefComplaint: chiefComplaint || service,
          source: mode === 'walkin' ? 'Walk-in' : 'Walk-in',
        });
      }

      await createAppointment({
        patientId: patient.id,
        service,
        serviceId: serviceId || undefined,
        scheduledAt,
        status: mode === 'walkin' ? 'arrived' : 'confirmed',
        source: 'Walk-in',
        assignedDoctorId: assignedDoctorId || undefined,
      });

      onToast(mode === 'walkin' ? `${patient.name} checked in` : `Booked for ${patient.name}`);
      resetForm();
      onBooked(scheduledAt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not book. Try again.';
      setError(msg);
      onToast(msg, 'err');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setStep('lookup');
    setName('');
    setPhone('');
    setAge('');
    setFoundPatient(null);
    setPatientContext(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearchDone(false);
    setChiefComplaint('');
    setDoctorChoice(activeDoctors.length === 1 ? activeDoctors[0]?.id || 'any' : 'any');
    setSlotKey('');
    setSlotOptions([]);
  }

  function switchMode(next: BookMode) {
    setMode(next);
    setError('');
    if (step === 'schedule' && next === 'walkin') {
      setStep(foundPatient ? 'treatment' : step);
    } else if (step === 'doctor' && next === 'walkin') {
      setStep('doctor');
    }
  }

  const showNoMatch =
    searchDone &&
    !searching &&
    searchResults.length === 0 &&
    searchQuery.trim().length >= 2 &&
    !foundPatient;

  const showMultiMatch =
    searchDone &&
    !searching &&
    searchResults.length > 1 &&
    !foundPatient;

  return (
    <div className="view book-view">
      <header className="page-header page-header-compact">
        <div className="page-header-main">
          <h1 className="page-title">New booking</h1>
          <p className="page-subtitle">
            {mode === 'walkin' ? 'Walk-in — books for now' : 'Schedule a visit'}
          </p>
        </div>
        <div className="book-mode-toggle" role="tablist" aria-label="Booking type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'schedule'}
            className={`book-mode-btn${mode === 'schedule' ? ' active' : ''}`}
            onClick={() => switchMode('schedule')}
          >
            <CalendarClock size={14} /> Schedule
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'walkin'}
            className={`book-mode-btn${mode === 'walkin' ? ' active' : ''}`}
            onClick={() => switchMode('walkin')}
          >
            <Zap size={14} /> Walk-in now
          </button>
        </div>
      </header>

      {step !== 'lookup' && (
        <BookStepNav labels={labels} activeIndex={activeLabelIndex} />
      )}

      {step === 'lookup' && (
        <div className="book-card">
          <p className="book-card-title">Find patient</p>
          <p className="book-card-sub">Phone or name — we search as you type.</p>

          <div className="form-field" style={{ marginTop: 16 }}>
            <label className="form-label" htmlFor="book-search">Phone or name</label>
            <input
              id="book-search"
              className="form-input"
              type="search"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (foundPatient && e.target.value !== foundPatient.phone.replace(/\D/g, '') && !foundPatient.name.toLowerCase().includes(e.target.value.toLowerCase())) {
                  setFoundPatient(null);
                  setPatientContext(null);
                }
              }}
              placeholder="9008747829 or Ramesh"
              autoFocus
            />
            {searching && <p className="book-search-status">Searching…</p>}
          </div>

          {foundPatient && searchResults.length <= 1 && (
            <PatientContextCard
              patient={foundPatient}
              ctx={patientContext}
              defaultDoctor={defaultDoctor}
              onContinue={() => setStep('treatment')}
            />
          )}

          {showMultiMatch && (
            <ul className="book-search-results">
              {searchResults.map((p) => {
                const [fg, bg] = ava(p.name);
                return (
                  <li key={p.id}>
                    <button type="button" className="book-search-result-row" onClick={() => selectPatient(p)}>
                      <div className="found-patient-ava" style={{ background: bg, color: fg }}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="found-patient-name">{p.name}</div>
                        <div className="found-patient-meta">
                          {p.phone}
                          {p.lastVisit ? ` · Last ${fmtVisitDate(p.lastVisit)}` : ''}
                        </div>
                      </div>
                      <ChevronRight size={16} className="search-result-chevron" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {showNoMatch && (
            <div className="book-no-match">
              <AlertCircle size={16} />
              <div>
                <strong>No patient found</strong>
                <p>
                  {isPhoneQuery(searchQuery)
                    ? 'This number is not in your records yet.'
                    : 'Try a phone number or a different spelling.'}
                </p>
              </div>
            </div>
          )}

          {showNoMatch && (
            <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={continueFromLookup}>
              <UserPlus size={14} /> Register new patient
            </button>
          )}

          {mode === 'walkin' && foundPatient && (
            <p className="book-walkin-hint">Walk-in mode — time will be set to now when you save.</p>
          )}
        </div>
      )}

      {step === 'patient' && (
        <div className="book-card">
          <p className="book-card-title">{mode === 'walkin' ? 'Quick details' : 'New patient'}</p>
          <p className="book-card-sub">
            {mode === 'walkin' ? 'Patient is at the desk — name is enough to continue.' : 'Add details once — we’ll remember next time.'}
          </p>
          <div className="form-field">
            <label className="form-label">Full name</label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Patient name"
              autoFocus
            />
          </div>
          <div className="form-field">
            <label className="form-label">Phone number</label>
            <input
              className="form-input"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(sanitizePhoneDigits(e.target.value))}
              placeholder="10-digit mobile"
              maxLength={10}
            />
          </div>
          {mode !== 'walkin' && (
            <div className="form-field">
              <label className="form-label">Age</label>
              <input
                className="form-input"
                value={age}
                onChange={(e) => setAge(sanitizeAge(e.target.value))}
                placeholder="e.g. 32"
                inputMode="numeric"
                maxLength={3}
              />
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep('lookup')}>Back</button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={!isValidPatientName(name) || !isValidPhone10(phone) || (mode !== 'walkin' && !isValidAge(age))}
              onClick={() => setStep('treatment')}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 'treatment' && (
        <div className="book-card">
          <p className="book-card-title">What is the visit for?</p>
          {foundPatient && (
            <PatientContextCard
              patient={foundPatient}
              ctx={patientContext}
              defaultDoctor={defaultDoctor}
              onContinue={() => {}}
              compact
            />
          )}
          {foundPatient && (foundPatient.age == null || foundPatient.age <= 0) && mode !== 'walkin' && (
            <div className="form-field">
              <label className="form-label">Age</label>
              <input
                className="form-input"
                value={age}
                onChange={(e) => setAge(sanitizeAge(e.target.value))}
                placeholder="Required for this patient"
                inputMode="numeric"
                maxLength={3}
              />
            </div>
          )}
          <div className="form-field">
            <label className="form-label"><Stethoscope size={12} /> Service</label>
            <select
              className="form-input form-select"
              value={service}
              onChange={(e) => {
                const title = e.target.value;
                const item = servicesList.find((s) => s.title === title);
                setService(title);
                setServiceId(item && !item.id.startsWith('fallback-') ? item.id : '');
              }}
            >
              {servicesList.map((s) => (
                <option key={s.id} value={s.title}>{s.title}</option>
              ))}
            </select>
            {selectedCatalog?.subtitle && (
              <p className="form-hint" style={{ marginTop: 8 }}>{selectedCatalog.subtitle}</p>
            )}
          </div>
          <div className="form-field">
            <label className="form-label" style={{ fontWeight: 500 }}>
              Problem <span style={{ color: 'var(--muted)' }}>(optional)</span>
            </label>
            <input
              className="form-input"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder="e.g. tooth pain"
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={goBackFromTreatment}>Back</button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={!returningAgeValid || !service.trim()}
              onClick={goToTreatmentNext}
            >
              {nextAfterTreatment(mode, multiDoctor) === 'confirm' ? 'Review' : 'Next'}
            </button>
          </div>
        </div>
      )}

      {step === 'doctor' && multiDoctor && (
        <div className="book-card">
          <p className="book-card-title">Choose doctor</p>
          <p className="book-card-sub">
            {mode === 'walkin'
              ? 'Who will see this patient?'
              : 'Pick a doctor or let us find the next available slot.'}
          </p>
          <BookDoctorPicker
            doctors={activeDoctors}
            value={doctorChoice}
            onChange={setDoctorChoice}
            lastDoctorName={patientContext?.lastDoctor}
          />
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep('treatment')}>Back</button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={doctorChoice !== 'any' && !doctorChoice}
              onClick={() => setStep(nextAfterDoctor(mode))}
            >
              {mode === 'walkin' ? 'Review' : 'Next'}
            </button>
          </div>
        </div>
      )}

      {step === 'schedule' && mode === 'schedule' && (
        <div className="book-card">
          <p className="book-card-title">Pick a time</p>
          {multiDoctor && doctorChoice !== 'any' && (
            <p className="book-card-sub">
              Showing slots for {doctorDisplayName(activeDoctors, doctorChoice)}
            </p>
          )}
          {showDoctorOnSlots && (
            <p className="book-card-sub">Open slots across all doctors — doctor shown per slot.</p>
          )}
          <div className="form-field">
            <label className="form-label">Date</label>
            <input
              type="date"
              className="form-input"
              min={new Date().toISOString().slice(0, 10)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-label">Time</label>
            <select
              className="form-input form-select"
              value={slotKey}
              onChange={(e) => {
                const key = e.target.value;
                setSlotKey(key);
                const opt = slotOptions.find((o) => slotOptionKey(o) === key);
                if (opt) setSlot(opt.label);
              }}
              disabled={loadingSlots || slotOptions.length === 0}
            >
              {loadingSlots && <option value="">Loading slots…</option>}
              {!loadingSlots && slotOptions.length === 0 && (
                <option value="">No open slots — try another day</option>
              )}
              {slotOptions.map((opt) => {
                const key = slotOptionKey(opt);
                return (
                  <option key={key} value={key}>
                    {formatSlotOptionLabel(opt, showDoctorOnSlots)}
                  </option>
                );
              })}
            </select>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(backFromSchedule(multiDoctor))}>Back</button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={!slotKey || slotOptions.length === 0}
              onClick={() => setStep('confirm')}
            >
              Review
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="book-card">
          <p className="book-card-title">Confirm booking</p>
          <div className="book-confirm-summary">
            <dl>
              <dt>Patient</dt>
              <dd>{foundPatient?.name || name}</dd>
              <dt>Service</dt>
              <dd>{service}</dd>
              {chiefComplaint && (
                <>
                  <dt>Problem</dt>
                  <dd>{chiefComplaint}</dd>
                </>
              )}
              {(multiDoctor || defaultDoctor) && (
                <>
                  <dt>Doctor</dt>
                  <dd>{confirmDoctorLabel}</dd>
                </>
              )}
              <dt>When</dt>
              <dd>
                {mode === 'walkin' ? (
                  <span className="book-walkin-now"><Zap size={13} /> Now — walk-in</span>
                ) : (
                  formatWhen(`${date}T${selectedSlot?.time || parseSlotLabel(slot) || '10:00'}:00`)
                )}
              </dd>
              <dt>Status</dt>
              <dd>{mode === 'walkin' ? 'Arrived (at desk)' : 'Confirmed'}</dd>
            </dl>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(backFromConfirm(mode, multiDoctor))}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={loading}
              onClick={submit}
            >
              {loading ? 'Saving…' : mode === 'walkin' ? 'Save walk-in' : 'Book appointment'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
