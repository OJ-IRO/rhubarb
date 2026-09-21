import { useEffect } from "react";

export interface ToastState {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** A short note at the foot of the screen, with one way to take the last thing back. */
export function Toast({ toast, onDone, ms = 8000 }: { toast: ToastState | null; onDone: () => void; ms?: number }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [toast, onDone, ms]);

  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{toast.message}</span>
      {toast.actionLabel && (
        <button
          className="toast-action"
          onClick={() => {
            toast.onAction?.();
            onDone();
          }}
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
}
