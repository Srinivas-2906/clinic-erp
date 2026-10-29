import type { ClinicAppointment } from '@clinic-erp/api-client';

const STATUS_LABEL: Record<string, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  arrived: 'Arrived',
  visited: 'Visited',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  requested: { bg: '#fef3c7', fg: '#b45309' },
  confirmed: { bg: '#e0f2fe', fg: '#0369a1' },
  arrived: { bg: '#f3e8ff', fg: '#7c3aed' },
  visited: { bg: '#ecfdf5', fg: '#059669' },
  cancelled: { bg: '#f3f4f6', fg: '#6b7280' },
  no_show: { bg: '#f3f4f6', fg: '#6b7280' },
};

export function statusLabel(status: string) {
  return STATUS_LABEL[status] || status;
}

export function statusTone(status: string) {
  return STATUS_TONE[status] || { bg: '#f3f4f6', fg: '#374151' };
}

/** Display label when a draft encounter is linked on an arrived visit. */
export function queueStatusLabel(appt: ClinicAppointment, encounterStatus?: 'draft' | 'finalized') {
  if (appt.status === 'arrived' && appt.encounterId && encounterStatus === 'draft') {
    return 'In consultation';
  }
  return statusLabel(appt.status);
}

export const QUEUE_NEXT: Partial<Record<string, string>> = {
  requested: 'confirmed',
  confirmed: 'arrived',
};

export function queueActionLabel(status: string) {
  if (status === 'requested') return 'Confirm';
  if (status === 'confirmed') return 'Check in';
  return null;
}
