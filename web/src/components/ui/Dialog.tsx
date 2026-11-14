import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { IconClose } from './Icons';

// Built on <dialog>: the browser handles focus trapping, Esc and the backdrop.
export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
      className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl p-0 text-ink shadow-xl backdrop:bg-[#0f2c4a]/40"
    >
      {open && (
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-surface-line px-5 py-3">
            <div>
              {eyebrow && <p className="text-xs font-bold uppercase tracking-wider text-brand-700">{eyebrow}</p>}
              <h2 id="dialog-title" className={eyebrow ? 'text-xl font-normal text-ink-heading' : 'text-lg font-semibold'}>
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-touch min-w-touch items-center justify-center rounded text-ink-muted hover:bg-surface-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus"
              aria-label={t('common.close')}
            >
              <IconClose />
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-surface-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ConfirmDialog guards destructive actions (marking invalid, merging).
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <div className="text-ink-muted">{body}</div>}
      {children}
    </Dialog>
  );
}
