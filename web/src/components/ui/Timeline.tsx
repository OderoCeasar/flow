import { useTranslation } from 'react-i18next';
import { statusColors } from '../../design/tokens';
import { formatDateTime } from '../../lib/format';
import { TIMELINE, type Status } from '../../lib/types';
import { IconCheck } from './Icons';

// The citizen's status timeline: Received → Verified → Scheduled → In progress → Fixed.
// Done steps show a tick and the time; the current step is marked for screen readers.
export function Timeline({ status, events }: { status: Status; events: { status: Status; created_at: string; note?: string }[] }) {
  const { t, i18n } = useTranslation();
  if (status === 'invalid') {
    const ev = events.find((e) => e.status === 'invalid');
    return (
      <div className="rounded-lg border-2 border-surface-line bg-surface p-4">
        <p className="font-semibold">{t('status.invalid')}</p>
        <p className="mt-1 text-ink-muted">{t('track.invalidBody')}</p>
        {ev?.note && <p className="mt-2 text-ink">“{ev.note}”</p>}
      </div>
    );
  }
  const reached = new Map<Status, string>();
  for (const e of events) reached.set(e.status, e.created_at);
  const currentIndex = TIMELINE.indexOf(status);
  return (
    <ol className="flex flex-col">
      {TIMELINE.map((s, i) => {
        const done = i <= currentIndex;
        const current = i === currentIndex;
        const at = reached.get(s);
        const c = statusColors[s];
        return (
          <li key={s} className="relative flex gap-3 pb-5 last:pb-0" aria-current={current ? 'step' : undefined}>
            {i < TIMELINE.length - 1 && (
              <span
                className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 ${i < currentIndex ? 'bg-brand-600' : 'bg-surface-sunken'}`}
                aria-hidden="true"
              />
            )}
            <span
              className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                done ? 'border-transparent' : 'border-surface-line bg-surface'
              }`}
              style={done ? { background: c.dot, color: '#fff' } : undefined}
              aria-hidden="true"
            >
              {done ? <IconCheck size={16} strokeWidth={3} /> : <span className="text-sm text-ink-subtle">{i + 1}</span>}
            </span>
            <div className="flex flex-col pt-1">
              <span className={`font-semibold ${done ? 'text-ink' : 'text-ink-subtle'}`}>
                {t(`status.${s}`)}
                {current && <span className="sr-only"> ({t('track.currentStep')})</span>}
              </span>
              <span className="text-sm text-ink-muted">{at ? formatDateTime(at, i18n.language) : t(`statusHelp.${s}`)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
