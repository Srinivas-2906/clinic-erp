const STORAGE_KEY = 'clinic_dense';

export function isDenseMode(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDenseMode(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
  applyDenseMode(enabled);
}

export function applyDenseMode(enabled = isDenseMode()) {
  document.documentElement.classList.toggle('dense', enabled);
}

export function toggleDenseMode(): boolean {
  const next = !isDenseMode();
  setDenseMode(next);
  return next;
}
