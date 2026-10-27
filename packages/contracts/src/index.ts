/** Shared API contracts (web + mobile). Keep in sync with Express handlers. */

export type ApiErrorBody = { error: string; code?: string };

export type Paginated<T> = { items: T[]; nextCursor?: string | null };

export type ClinicalVitalInput = { code: string; value: string; unit?: string };

export type PrescriptionLineInput = {
  drugName: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
};

export type EncounterStatus = 'draft' | 'finalized';

export type EncounterSummary = {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentId?: string | null;
  status: EncounterStatus;
  chiefComplaint?: string;
  historySummary?: string;
  clinicalNote?: string;
  finalizedAt?: string | null;
  createdAt?: string;
};

export type MeCapabilities = {
  managePatients?: boolean;
  manageAppointments?: boolean;
  recordPayments?: boolean;
  manageFinancials?: boolean;
  manageSettings?: boolean;
  viewReports?: boolean;
};

export type MeResponse = {
  user: {
    id: string;
    email?: string;
    name?: string;
    role?: string;
    effectiveRole?: string;
    canSignClinical?: boolean;
    clinicianDoctorId?: string | null;
    capabilities?: MeCapabilities;
  };
  tenant?: { slug?: string; name?: string };
};

export function parseApiError(data: unknown, fallback = 'Request failed'): string {
  if (data && typeof data === 'object' && 'error' in data) {
    return String((data as ApiErrorBody).error || fallback);
  }
  return fallback;
}

export function validatePrescriptionLines(lines: PrescriptionLineInput[]): string | null {
  for (const line of lines) {
    const name = String(line.drugName || '').trim();
    if (!name) return 'Each prescription line needs a medicine name';
    if (name.length > 200) return 'Medicine name too long';
  }
  return null;
}
