/** Allowed API origins for authenticated clinic file GET (never send Bearer elsewhere). */
export function getClinicApiOrigins(): string[] {
  const api = import.meta.env.VITE_CLINIC_API || import.meta.env.VITE_WHATSAPP_API || '/api';
  const origins = new Set<string>();
  origins.add('https://clinic-api.kaana.in');
  if (typeof window !== 'undefined') {
    origins.add(window.location.origin);
  }
  if (typeof api === 'string' && /^https?:\/\//i.test(api)) {
    try {
      origins.add(new URL(api).origin);
    } catch {
      /* ignore */
    }
  }
  return [...origins];
}

const CLINIC_FILES_PATH =
  /^\/api\/clinic\/files\/([^/]+)\/([^/]+)$/;

export type ParsedClinicFileUrl = {
  tenantId: string;
  fileName: string;
  href: string;
};

/** Strict match for GET /api/clinic/files/:tenantId/:fileName on an allowed origin. */
export function parseProtectedClinicFileUrl(urlString: string): ParsedClinicFileUrl | null {
  if (!urlString || typeof urlString !== 'string') return null;
  let parsed: URL;
  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'https://clinic.kaana.in';
    parsed = new URL(urlString.trim(), base);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null;
  if (!getClinicApiOrigins().includes(parsed.origin)) return null;
  const match = CLINIC_FILES_PATH.exec(parsed.pathname);
  if (!match) return null;
  const tenantId = match[1];
  const fileName = match[2];
  if (!tenantId || !fileName || fileName.includes('..')) return null;
  return { tenantId, fileName, href: parsed.href };
}

export function isProtectedClinicFileUrl(urlString: string): boolean {
  return parseProtectedClinicFileUrl(urlString) !== null;
}

/** JPEG, PNG, WebP — reliable in common browsers. HEIC/HEIF excluded (D2 allows upload, not in-browser preview). */
export const BROWSER_PREVIEW_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function isBrowserPreviewableImageBlob(blob: Blob): boolean {
  if (blob.type && BROWSER_PREVIEW_IMAGE_TYPES.has(blob.type)) return true;
  return false;
}

export function isBrowserPreviewableImageContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const base = contentType.split(';')[0].trim().toLowerCase();
  return BROWSER_PREVIEW_IMAGE_TYPES.has(base);
}
