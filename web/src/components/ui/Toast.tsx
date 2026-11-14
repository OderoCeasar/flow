import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconClose, IconWarning } from './Icons';

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
  undo?: () => void;
}

const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

// Toasts confirm actions and offer Undo for 8 seconds. They live in an
// aria-live region so screen readers announce them.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = next.current++;
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
  }, []);
  const dismiss = (id: number) => setToasts((ts) => ts.filter((t) => t.id !== id));
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[2000] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const { t } = useTranslation();
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const timer = setTimeout(() => done.current(), toast.undo ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.undo]);
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg bg-ink px-4 py-2 text-ink-inverse shadow-lg"
    >
      {toast.tone === 'error' ? <IconWarning size={20} className="shrink-0" /> : <IconCheck size={20} className="shrink-0" />}
      <span className="flex-1 py-1">{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          className="min-h-touch rounded px-3 font-semibold text-brand-200 underline hover:text-white focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus"
          onClick={() => {
            toast.undo?.();
            onDone();
          }}
        >
          {t('common.undo')}
        </button>
      )}
      <button
        type="button"
        onClick={onDone}
        aria-label={t('common.close')}
        className="flex min-h-touch min-w-touch items-center justify-center rounded hover:bg-white/10 focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus"
      >
        <IconClose size={18} />
      </button>
    </div>
  );
}
