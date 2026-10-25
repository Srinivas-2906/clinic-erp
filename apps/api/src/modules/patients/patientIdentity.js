/** Patient identity resolution — never guess chart ownership from phone alone. */

export class PatientIdentityError extends Error {
  /** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PatientIdentityError';
    this.code = code;
    this.details = details;
  }
}

/** @typedef {'strict_inbound' | 'self_service_booking'} IdentityPolicy */

export function normalizePatientName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function phoneDigitsOnly(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/** Inbound WhatsApp/SMS must not link charts by name+phone alone (clinical safety). */
export function identityPolicyForSource(source) {
  const s = String(source || '').trim().toLowerCase();
  if (s === 'website' || s === 'web') return 'self_service_booking';
  return 'strict_inbound';
}

/** @param {import('better-sqlite3').Database} db */
export function listPatientsByPhoneDigits(db, tenantId, phone) {
  const digits = phoneDigitsOnly(phone);
  if (!digits) return [];
  return db
    .prepare(
      `SELECT * FROM patients WHERE tenant_id = ? AND phone_digits = ? ORDER BY updated_at DESC, created_at DESC`,
    )
    .all(tenantId, digits);
}

/** @param {import('better-sqlite3').Database} db */
export function findPatientByConversationId(db, tenantId, conversationId) {
  if (!conversationId) return null;
  return db
    .prepare('SELECT * FROM patients WHERE tenant_id = ? AND conversation_id = ?')
    .get(tenantId, conversationId);
}

function ambiguousError(matches) {
  return new PatientIdentityError(
    'PATIENT_AMBIGUOUS',
    'Multiple patients share this phone number, or identity cannot be confirmed automatically. Staff must select the correct patient.',
    {
      candidates: matches.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
      })),
    },
  );
}

/**
 * Resolve patient for automated channels (WhatsApp, website booking).
 * @param {import('better-sqlite3').Database} db
 * @param {{
 *   tenantId: string;
 *   phone: string;
 *   patientName?: string;
 *   conversationId?: string;
 *   source?: string;
 *   identityPolicy?: IdentityPolicy;
 *   chiefComplaint?: string;
 *   age?: number | null;
 *   createIfMissing?: boolean;
 *   insertPatient: (tenantId: string, data: object) => object;
 *   patchPatientMetadata: (id: string, tenantId: string, patch: object) => object | null;
 * }} opts
 */
export function resolvePatientForInbound(opts) {
  const {
    db,
    tenantId,
    phone,
    patientName,
    conversationId,
    source = 'WhatsApp',
    identityPolicy = identityPolicyForSource(source),
    chiefComplaint,
    age,
    createIfMissing = true,
    insertPatient,
    patchPatientMetadata,
  } = opts;

  const byConversation = findPatientByConversationId(db, tenantId, conversationId);
  if (byConversation) {
    return patchPatientMetadata(byConversation.id, tenantId, {
      chiefComplaint,
      age,
      conversationId,
    });
  }

  const digits = phoneDigitsOnly(phone);
  if (!digits) throw new PatientIdentityError('PHONE_REQUIRED', 'Valid phone required');

  const matches = listPatientsByPhoneDigits(db, tenantId, phone);
  const nameNorm = patientName ? normalizePatientName(patientName) : '';

  if (identityPolicy === 'strict_inbound' && matches.length > 0) {
    throw ambiguousError(matches);
  }

  if (matches.length === 0) {
    if (!createIfMissing) {
      throw new PatientIdentityError('PATIENT_NOT_FOUND', 'No patient found for this phone');
    }
    if (!nameNorm || nameNorm.length < 2) {
      throw new PatientIdentityError('NAME_REQUIRED', 'Patient name is required to register');
    }
    return insertPatient(tenantId, {
      name: patientName,
      phone,
      source,
      chiefComplaint,
      age,
      conversationId,
    });
  }

  if (identityPolicy === 'self_service_booking' && nameNorm.length >= 2) {
    const byName = matches.filter((row) => normalizePatientName(row.name) === nameNorm);
    if (byName.length === 1) {
      return patchPatientMetadata(byName[0].id, tenantId, {
        chiefComplaint,
        age,
        conversationId,
      });
    }
    if (byName.length === 0 && createIfMissing) {
      return insertPatient(tenantId, {
        name: patientName,
        phone,
        source,
        chiefComplaint,
        age,
        conversationId,
      });
    }
    if (byName.length > 1) {
      throw ambiguousError(byName);
    }
  }

  throw ambiguousError(matches);
}
