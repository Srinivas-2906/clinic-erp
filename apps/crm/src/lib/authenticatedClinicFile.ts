import { authHeaders } from './auth';
import { isProtectedClinicFileUrl, parseProtectedClinicFileUrl } from './clinicFileUrls';
import { resolveTenantSlug } from './tenant';

export class ClinicFileLoadError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ClinicFileLoadError';
    this.status = status;
  }
}

export function clinicFileLoadErrorMessage(status?: number): string {
  switch (status) {
    case 401:
      return 'Sign in again to view this file.';
    case 403:
      return 'You do not have access to this file.';
    case 404:
      return 'File not found.';
    default:
      return 'Could not load file. Check your connection and try again.';
  }
}

/**
 * Fetch a protected clinic file with Bearer auth. Caller must revoke objectUrl when done.
 * Does not attach Authorization to non-clinic URLs.
 */
export async function loadAuthenticatedClinicFile(urlString: string): Promise<{
  blob: Blob;
  objectUrl: string;
  contentType: string | null;
}> {
  const parsed = parseProtectedClinicFileUrl(urlString);
  if (!parsed) {
    throw new ClinicFileLoadError('Not a clinic file URL');
  }

  const tenantSlug = resolveTenantSlug();
  let res: Response;
  try {
    res = await fetch(parsed.href, {
      method: 'GET',
      headers: {
        ...authHeaders(),
        ...(tenantSlug ? { 'x-tenant-slug': tenantSlug } : {}),
      },
    });
  } catch {
    throw new ClinicFileLoadError(clinicFileLoadErrorMessage());
  }

  if (!res.ok) {
    throw new ClinicFileLoadError(clinicFileLoadErrorMessage(res.status), res.status);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const contentType = res.headers.get('Content-Type') || blob.type || null;
  return { blob, objectUrl, contentType };
}

/** @deprecated use parseProtectedClinicFileUrl / isProtectedClinicFileUrl */
export function shouldUseAuthenticatedClinicFileFetch(urlString: string): boolean {
  return isProtectedClinicFileUrl(urlString);
}
