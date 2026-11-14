import { useTranslation } from 'react-i18next';
import { formatWhen } from '../../lib/format';
import { TIMELINE, type Status } from '../../lib/types';
import { IconCheck } from './Icons';

// Received → Verified → Scheduled → In progress → Fixed.
// Done steps: soft tick and the time. Current step: solid circle and
// "Current status". Later steps: grey and "Waiting".
export function Timeline({ status, events }: { status: Status; events: { status: Status; created_at: string; note?: string }[] }) {
  const { t, i18n } = useTranslation();
  if (status === 'invalid') {
    const ev = events.find((e) => e.status === 'invalid');
    return (
      <div className="rounded-xl border border-surface-line bg-surface-muted p-4">
        <p className="font-semibold text-ink">{t('status.invalid')}</p>
        <p className="mt-1 text-ink-muted">{t('track.invalidBody')}</p>
        {ev?.note && <p className="mt-2 text-ink">“{ev.note}”</p>}
      </div>
    );
  }
  const reached = new Map<Status, string>();
  for (const e of events) reached.set(e.status, e.created_at);
  const current = TIMELINE.indexOf(status);
  const finished = status === 'fixed';
  return (
    <ol className="flex flex-col">
      {TIMELINE.map((s, i) => {
        const done = i < current || (finished && i === current);
        const isCurrent = i === current;
        const at = reached.get(s);
        const circle = isCurrent
          ? 'bg-brand-600 text-white'
          : done
            ? 'bg-brand-100 text-brand-700'
            : 'bg-surface-muted text-ink-subtle';
        return (
          <li key={s} className="relative flex gap-4 pb-6 last:pb-0" aria-current={isCurrent ? 'step' : undefined}>
            {i < TIMELINE.length - 1 && (
              <span
                className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 ${i < current ? 'bg-brand-500' : 'bg-surface-sunken'}`}
                aria-hidden="true"
              />
            )}
            <span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${circle}`} aria-hidden="true">
              {done ? <IconCheck size={16} strokeWidth={2.5} /> : i + 1}
            </span>
            <div className="flex flex-col pt-0.5">
              <span className={`font-semibold ${isCurrent ? 'text-ink' : done ? 'text-brand-700' : 'text-ink-subtle'}`}>
                {t(`status.${s}`)}
                {isCurrent && <span className="sr-only"> ({t('track.currentStep')})</span>}
              </span>
              <span className={`text-sm ${done || isCurrent ? 'text-brand-700' : 'text-ink-subtle'}`}>
                {isCurrent && !finished ? t('timeline.current') : done ? (at ? formatWhen(at, t, i18n.language) : '') : t('timeline.waiting')}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
