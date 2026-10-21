import { FileText } from 'lucide-react';
import { useAuthenticatedClinicFileUrl } from '../hooks/useAuthenticatedClinicFileUrl';
import { isProtectedClinicFileUrl } from '../lib/clinicFileUrls';

type Props = {
  url: string;
  alt: string;
  className?: string;
};

/** Record thumbnail: protected clinic files via authenticated blob; external URLs unchanged. */
export function AuthenticatedClinicRecordThumb({ url, alt, className = 'record-thumb' }: Props) {
  const isProtected = isProtectedClinicFileUrl(url);
  const { state, openBlobInNewTab } = useAuthenticatedClinicFileUrl(isProtected ? url : undefined);

  if (!isProtected) {
    return (
      <a className={className} href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={alt} />
      </a>
    );
  }

  if (state.kind === 'loading' || state.kind === 'idle') {
    return (
      <div className={`${className} record-thumb-loading`} aria-busy="true">
        <span className="muted" style={{ fontSize: 11 }}>Loading…</span>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className={`${className} record-thumb-error`} title={state.message}>
        <span className="muted" style={{ fontSize: 11 }}>{state.message}</span>
      </div>
    );
  }

  if (state.kind === 'ready' && state.previewable) {
    return (
      <button
        type="button"
        className={`${className} record-thumb-btn`}
        onClick={openBlobInNewTab}
        aria-label={`Open ${alt}`}
      >
        <img src={state.displayUrl} alt={alt} />
      </button>
    );
  }

  if (state.kind === 'ready' && !state.previewable) {
    return (
      <button
        type="button"
        className={`${className} record-thumb-btn record-thumb-file`}
        onClick={openBlobInNewTab}
        aria-label={`Open ${alt}`}
      >
        <FileText size={28} strokeWidth={1.5} color="var(--brand)" />
        <span className="muted" style={{ fontSize: 11 }}>View file</span>
      </button>
    );
  }

  return null;
}
