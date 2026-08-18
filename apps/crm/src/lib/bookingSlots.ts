export interface SlotOption {
  label: string;
  time: string;
  doctorId: string;
  doctorName: string;
}

export function slotOptionKey(opt: Pick<SlotOption, 'time' | 'doctorId'>) {
  return `${opt.time}|${opt.doctorId}`;
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

export function formatSlotOptionLabel(opt: SlotOption, showDoctor: boolean) {
  if (!showDoctor || !opt.doctorName) return opt.label;
  return `${opt.label} — ${opt.doctorName}`;
}

export function buildSlotOptions(
  slots: string[],
  slotOptions: SlotOption[] | undefined,
  doctorId?: string,
): SlotOption[] {
  if (slotOptions?.length) return slotOptions;
  return slots.map((label) => ({
    label,
    time: parseSlotLabel(label) || label,
    doctorId: doctorId || '',
    doctorName: '',
  }));
}
