import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { IconInfo, IconRefresh, IconWarning } from './Icons';

// Skeletons, not spinners, for anything list-shaped.
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-surface-sunken motion-reduce:animate-none ${className}`} aria-hidden="true" />;
}

export function ListSkeleton({ rows = 5, label }: { rows?: number; label?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={label ?? t('app.loading')} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg bg-surface p-4">
          <Skeleton className="h-10 w-10" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-surface px-6 py-10 text-center">
      <span className="text-brand-600">{icon ?? <IconInfo size={36} />}</span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {body && <p className="max-w-sm text-ink-muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border-2 border-danger-600 bg-danger-50 px-6 py-8 text-center">
      <IconWarning size={32} className="text-danger-700" />
      <p className="max-w-sm font-medium text-ink">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} icon={<IconRefresh size={18} />}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'success'; children: ReactNode }) {
  const styles = {
    info: 'border-brand-200 bg-brand-50 text-brand-900',
    warning: 'border-warning-800/30 bg-warning-50 text-warning-800',
    success: 'border-success-700/30 bg-success-50 text-success-700',
  }[tone];
  return <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${styles}`}>{children}</div>;
}
