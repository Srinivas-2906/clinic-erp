import { FileText } from 'lucide-react';
import { useAuthenticatedClinicFileUrl } from '../hooks/useAuthenticatedClinicFileUrl';

type Props = {
  storedUrl: string;
  alt: string;
  className?: string;
};

/** Prescription preview for an existing stored API URL (not local File picks). */
export function AuthenticatedClinicFilePreview({ storedUrl, alt, className }: Props) {
  const { state, openBlobInNewTab } = useAuthenticatedClinicFileUrl(storedUrl);

  if (state.kind === 'loading' || state.kind === 'idle') {
    return <span className="muted" style={{ fontSize: 12 }}>Loading preview…</span>;
  }

  if (state.kind === 'error') {
    return (
      <div className="form-hint form-hint-warn" role="alert">
        {state.message}
      </div>
    );
  }

  if (state.kind === 'ready' && state.previewable) {
    return <img className={className} src={state.displayUrl} alt={alt} />;
  }

  if (state.kind === 'ready' && !state.previewable) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={openBlobInNewTab}>
        <FileText size={16} /> View file (preview not supported in this browser)
      </button>
    );
  }

  return null;
}
