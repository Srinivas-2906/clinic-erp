const DRAFT_KEY = 'clinic_signup_draft_v1';
const IDEM_KEY = 'clinic_signup_idempotency_v1';

export type SignupDraft = {
  step: number;
  clinicName: string;
  slug: string;
  slugTouched: boolean;
  planId: 'essential' | 'professional' | 'enterprise';
  ownerName: string;
  ownerEmail: string;
};

export function loadSignupDraft(): SignupDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SignupDraft;
  } catch {
    return null;
  }
}

export function saveSignupDraft(draft: SignupDraft) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearSignupDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
}

export function getSignupIdempotencyKey() {
  let key = sessionStorage.getItem(IDEM_KEY);
  if (!key) {
    key = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(IDEM_KEY, key);
  }
  return key;
}

export function clearSignupIdempotencyKey() {
  sessionStorage.removeItem(IDEM_KEY);
}
