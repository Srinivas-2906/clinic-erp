import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ClinicFileLoadError,
  clinicFileLoadErrorMessage,
  loadAuthenticatedClinicFile,
} from '../lib/authenticatedClinicFile';
import {
  isBrowserPreviewableImageBlob,
  isBrowserPreviewableImageContentType,
  isProtectedClinicFileUrl,
} from '../lib/clinicFileUrls';

export type AuthenticatedClinicFileState =
  | { kind: 'idle' }
  | { kind: 'external'; displayUrl: string }
  | { kind: 'loading' }
  | { kind: 'ready'; displayUrl: string; previewable: boolean; blob: Blob }
  | { kind: 'error'; message: string };

/**
 * Loads protected clinic API file URLs via authenticated fetch → blob URL.
 * Revokes blob URLs on change/unmount; ignores stale async completions.
 */
export function useAuthenticatedClinicFileUrl(storedUrl: string | undefined | null) {
  const [state, setState] = useState<AuthenticatedClinicFileState>({ kind: 'idle' });
  const requestSeq = useRef(0);
  const objectUrlRef = useRef<string | null>(null);

  const revokeCurrent = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    const url = (storedUrl || '').trim();
    requestSeq.current += 1;
    const seq = requestSeq.current;
    revokeCurrent();

    if (!url) {
      setState({ kind: 'idle' });
      return;
    }

    if (!isProtectedClinicFileUrl(url)) {
      setState({ kind: 'external', displayUrl: url });
      return;
    }

    setState({ kind: 'loading' });

    void (async () => {
      try {
        const { blob, objectUrl, contentType } = await loadAuthenticatedClinicFile(url);
        if (seq !== requestSeq.current) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        objectUrlRef.current = objectUrl;
        const previewable =
          isBrowserPreviewableImageBlob(blob) ||
          isBrowserPreviewableImageContentType(contentType);
        setState({ kind: 'ready', displayUrl: objectUrl, previewable, blob });
      } catch (err) {
        if (seq !== requestSeq.current) return;
        const message =
          err instanceof ClinicFileLoadError
            ? err.message
            : clinicFileLoadErrorMessage();
        setState({ kind: 'error', message });
      }
    })();

    return () => {
      requestSeq.current += 1;
      revokeCurrent();
    };
  }, [storedUrl, revokeCurrent]);

  const openBlobInNewTab = useCallback(() => {
    if (state.kind === 'ready') {
      window.open(state.displayUrl, '_blank', 'noopener,noreferrer');
    }
  }, [state]);

  return { state, openBlobInNewTab };
}
