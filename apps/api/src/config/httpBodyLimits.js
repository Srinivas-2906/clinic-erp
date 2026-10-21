import { MAX_UPLOAD_BYTES } from '../services/uploadValidation.js';

/** D2 decoded file cap (re-export for transport sizing). */
export { MAX_UPLOAD_BYTES };

/**
 * Max JSON body size for base64 upload payloads.
 * 8 MiB decoded → ~10.67 MiB base64 + JSON fields; 12 MiB transport cap with margin.
 * D2 still rejects decoded buffers > MAX_UPLOAD_BYTES.
 */
export const MAX_JSON_BODY_BYTES = 12 * 1024 * 1024;

export const EXPRESS_JSON_LIMIT = `${MAX_JSON_BODY_BYTES / (1024 * 1024)}mb`;

export function jsonBodyParserOptions() {
  return { limit: EXPRESS_JSON_LIMIT };
}
