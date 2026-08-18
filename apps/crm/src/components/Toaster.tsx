import type { ToastMsg } from '../types';
import { CheckCircle2, XCircle, X } from 'lucide-react';

export function Toaster({ toasts, onDismiss }: { toasts: ToastMsg[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'ok' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          <span>{t.text}</span>
          <button type="button" className="toast-close" onClick={() => onDismiss(t.id)}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
