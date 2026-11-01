export type AppointmentStatus =
  | 'requested'
  | 'confirmed'
  | 'arrived'
  | 'visited'
  | 'cancelled'
  | 'no_show';

export interface Patient {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email?: string;
  age?: number | null;
  gender?: string;
  chiefComplaint?: string;
  isReturning?: boolean;
  tags?: string[];
  notes?: { text: string; at: string; by: string }[];
  lastVisit?: string | null;
  source?: string;
  photoUrl?: string;
  prescriptionUrl?: string;
  recordUrls?: string[];
  totalPaid?: number;
  lastPaymentAmount?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Appointment {
  id: string;
  tenantId: string;
  patientId: string;
  patientName?: string;
  patientPhone?: string;
  service: string;
  scheduledAt: string;
  durationMin?: number;
  status: AppointmentStatus;
  assignedDoctor?: string;
  assignedDoctorId?: string | null;
  encounterId?: string | null;
  notes?: string;
  source?: string;
  paymentAmount?: number | null;
  paymentMethod?: string;
  createdAt?: string;
}

export interface VitalInput {
  code: string;
  value: string;
  unit?: string;
}

export interface PrescriptionItemInput {
  drugName: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

export interface Encounter {
  id: string;
  tenantId?: string;
  patientId: string;
  doctorId: string;
  appointmentId?: string | null;
  status: 'draft' | 'finalized';
  chiefComplaint?: string;
  historySummary?: string;
  clinicalNote?: string;
  vitals?: { id?: string; code: string; value: string; unit?: string }[];
  diagnoses?: { id?: string; description: string; code?: string; isPrimary?: boolean }[];
  prescription?: {
    id?: string;
    status?: string;
    pdfStorageKey?: string;
    items?: PrescriptionItemInput[];
  } | null;
  finalizedAt?: string | null;
  createdAt?: string;
}

export interface Doctor {
  id: string;
  tenantId: string;
  name: string;
  displayName: string;
  specialty?: string;
  phone?: string;
  email?: string;
  qualification?: string;
  registrationNumber?: string;
  avatarUrl?: string;
  userId?: string | null;
  appointmentColor?: string;
  defaultSlotDuration?: number;
  isActive?: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface DoctorSession {
  id: string;
  tenantId: string;
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes?: number;
  locationId?: string | null;
}

export interface DoctorTimeOff {
  id: string;
  tenantId: string;
  doctorId: string;
  startDatetime: string;
  endDatetime: string;
  reason?: string;
  createdBy?: string | null;
}

export interface TodayStats {
  date: string;
  total: number;
  unconfirmed: number;
  unconfirmedToday?: number;
  confirmed: number;
  arrived: number;
  totalPatients: number;
  appointments: Appointment[];
  /** Website / phone requests for a future day — need confirmation */
  pendingRequests?: Appointment[];
  /** All active bookings on later days (confirmed walk-ins, website requests, etc.) */
  upcomingLater?: Appointment[];
}

export interface Payment {
  id: string;
  patientId: string;
  patientName?: string;
  amount: number;
  method: string;
  reference?: string;
  notes?: string;
  status: string;
  kind?: 'payment' | 'refund' | string;
  invoiceId?: string | null;
  relatedPaymentId?: string | null;
  createdAt?: string;
}

export interface PaymentSummary {
  todayTotal: number;
  monthTotal: number;
  dueCount: number;
  outstandingBalance?: number;
  openInvoiceCount?: number;
}

export interface InvoiceLineItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
  catalogItemId?: string | null;
}

export type InvoiceStatus = 'open' | 'partial' | 'paid' | 'void';

export interface PatientInvoice {
  id: string;
  patientId: string;
  appointmentId?: string | null;
  encounterId?: string | null;
  status: InvoiceStatus;
  total: number;
  amountPaid: number;
  balanceDue: number;
  currency?: string;
  notes?: string;
  createdAt?: string;
  lineItems: InvoiceLineItem[];
}

export interface UserCapabilities {
  managePatients?: boolean;
  manageAppointments?: boolean;
  recordPayments?: boolean;
  manageFinancials?: boolean;
  manageSettings?: boolean;
  viewReports?: boolean;
}

export type TabId = 'overview' | 'today' | 'patients' | 'book' | 'payments' | 'reports' | 'doctors' | 'team' | 'audit' | 'settings';

export interface AccessRequest {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string;
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  requested: 'Not confirmed',
  confirmed: 'Confirmed',
  arrived:   'Arrived',
  visited:   'Completed',
  cancelled: 'Cancelled',
  no_show:   'Did not come',
};

export const SERVICES = [
  'Check-up',
  'Teeth cleaning',
  'Root canal',
  'Tooth removal',
  'Dentures',
  'Smile work',
  'Braces',
  'Tooth filling',
  'X-ray',
  'Follow-up visit',
];

export const GENDERS = ['Male', 'Female', 'Other'];

export const PATIENT_SOURCES = ['Walk-in', 'WhatsApp', 'Phone call', 'Referral', 'Other'];

export const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Online', 'Other'];

export interface ClinicFollowUp {
  id: string;
  encounterId: string;
  patientId: string;
  dueDate: string;
  instructions: string;
  status: 'pending' | 'scheduled' | 'cancelled' | string;
  scheduledAppointmentId?: string | null;
  patientName?: string;
  patientPhone?: string;
  chiefComplaint?: string;
  encounterFinalizedAt?: string | null;
  scheduledAt?: string | null;
  appointmentStatus?: string | null;
}

export interface CatalogItem {
  id: string;
  title: string;
  subtitle?: string;
  category?: string;
  price?: string;      // display price label (e.g. "₹500" or "From ₹800")
  priceNum?: number;   // numeric price if applicable
  meta?: string;
  imageUrl?: string;
  status?: string;     // e.g. "Available" (from backend)
}

export interface ToastMsg {
  id: number;
  text: string;
  type: 'ok' | 'err';
}
