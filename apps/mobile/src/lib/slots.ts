import type { SlotOption } from '@clinic-erp/api-client';

const CLINIC_OFFSET = '+05:30';

export function slotTimeFromOption(opt: SlotOption): string | null {
  const t = opt.time?.trim();
  if (t && /^\d{2}:\d{2}$/.test(t)) return t;
  const m = opt.label.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || '0');
  const period = (m[3] || '').toUpperCase();
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Canonical scheduledAt for API (clinic timezone offset). */
export function scheduledAtFromDateAndSlot(dateYmd: string, opt: SlotOption) {
  const time = slotTimeFromOption(opt);
  if (!time) return null;
  return `${dateYmd}T${time}:00${CLINIC_OFFSET}`;
}

export function pickSlotOptions(
  slots: string[],
  slotOptions: SlotOption[] | undefined,
  doctorId?: string,
): SlotOption[] {
  if (slotOptions?.length) return slotOptions;
  return slots.map((label) => ({
    label,
    time: slotTimeFromOption({ label }) || undefined,
    doctorId: doctorId || '',
    doctorName: '',
  }));
}
