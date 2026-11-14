import { useTranslation } from 'react-i18next';
import { severityColors, statusColors } from '../../design/tokens';
import type { LeakType, Severity, Status } from '../../lib/types';
import { IconCheck, IconDrop, IconWarning, leakTypeIcon, severityIcon } from './Icons';

// Same colours and words for a status everywhere in the app.
export function StatusBadge({ status, size = 'md' }: { status: Status; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  const c = statusColors[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      }`}
      style={{ background: c.bg, color: c.fg }}
    >
      {status === 'fixed' ? (
        <IconCheck size={14} strokeWidth={3} />
      ) : (
        <span className="h-2 w-2 rounded-full" style={{ background: c.dot }} aria-hidden="true" />
      )}
      {t(`status.${status}`)}
    </span>
  );
}

// Severity always shows an icon and a word, so colour is never the only signal.
export function SeverityBadge({ severity, size = 'md', plain = false }: { severity: Severity | null; size?: 'sm' | 'md'; plain?: boolean }) {
  const { t } = useTranslation();
  if (!severity) {
    return <span className="text-sm text-ink-subtle">{t('severity.unknown')}</span>;
  }
  if (plain) {
    // Dashboard style: no fill, a warning triangle for critical and a drop otherwise.
    const PlainIcon = severity === 'critical' ? IconWarning : IconDrop;
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold" style={{ color: severityColors[severity].fg }}>
        <PlainIcon size={16} strokeWidth={2.2} />
        {t(`severity.${severity}`)}
      </span>
    );
  }
  const c = severityColors[severity];
  const Icon = severityIcon[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded font-semibold ${
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm'
      }`}
      style={{ background: c.bg, color: c.fg }}
    >
      <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2.5} />
      {t(`severity.${severity}`)}
    </span>
  );
}

export function LeakTypeLabel({ type, showIcon = true }: { type: LeakType | null; showIcon?: boolean }) {
  const { t } = useTranslation();
  const Icon = leakTypeIcon[type ?? 'other'];
  return (
    <span className="inline-flex items-center gap-1.5">
      {showIcon && <Icon size={18} className="shrink-0 text-ink-muted" />}
      {t(`leakType.${type ?? 'unknown'}`)}
    </span>
  );
}

// PriorityScore is the most prominent number on a dashboard row.
export function PriorityScore({ score, overridden = false }: { score: number; overridden?: boolean }) {
  const { t } = useTranslation();
  const tone = score >= 70 ? 'bg-danger-600 text-ink-inverse' : score >= 45 ? 'bg-warning-800 text-ink-inverse' : 'bg-surface-sunken text-ink';
  return (
    <span className={`inline-flex min-w-[2.75rem] items-center justify-center rounded px-2 py-1 text-lg font-bold tabular-nums ${tone}`}>
      <span aria-hidden="true">
        {score}
        {overridden && '*'}
      </span>
      <span className="sr-only">{t('priority.scoreLabel', { score }) + (overridden ? `, ${t('priority.overridden')}` : '')}</span>
    </span>
  );
}

// "Burst main" when a burst pipe is on a main, otherwise the leak type.
export function leakName(t: (k: string) => string, type: LeakType | null, isMain: boolean) {
  if (type === 'burst_pipe' && isMain) return t('leakType.burst_main');
  return t(`leakType.${type ?? 'unknown'}`);
}
