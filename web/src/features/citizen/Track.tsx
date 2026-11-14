import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, ButtonLink } from '../../components/ui/Button';
import { LeakTypeLabel, StatusBadge } from '../../components/ui/Badges';
import { Field, TextInput } from '../../components/ui/Field';
import { CitizenShell } from '../../components/ui/Layout';
import { IconRefresh } from '../../components/ui/Icons';
import { ErrorState, ListSkeleton, Notice } from '../../components/ui/States';
import { Timeline } from '../../components/ui/Timeline';
import { api, ApiError } from '../../lib/api';
import { duration, formatDateTime } from '../../lib/format';
import type { PublicStatus } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';

export default function Track() {
  const { ref } = useParams();
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const errorMessage = useErrorMessage();
  const [input, setInput] = useState('');
  const q = useQuery({
    queryKey: ['track', ref],
    queryFn: () => api<PublicStatus>(`/reports/${encodeURIComponent(ref!)}`),
    enabled: !!ref,
    refetchInterval: 60_000,
  });

  if (!ref) {
    return (
      <CitizenShell title={t('track.title')} back={{ to: '/', label: t('app.back') }}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) nav(`/track/${input.trim().toUpperCase()}`);
          }}
        >
          <Field label={t('home.trackLabel')} hint={t('home.trackHint')}>
            {({ id, describedBy }) => (
              <TextInput id={id} aria-describedby={describedBy} value={input} onChange={(e) => setInput(e.target.value)} placeholder="FLW-7K3QPX" />
            )}
          </Field>
          <Button type="submit">{t('home.trackButton')}</Button>
        </form>
      </CitizenShell>
    );
  }

  return (
    <CitizenShell title={t('track.title')} back={{ to: '/', label: t('app.back') }}>
      {q.isLoading && <ListSkeleton rows={3} label={t('track.loading')} />}
      {q.isError &&
        (q.error instanceof ApiError && q.error.status === 404 ? (
          <ErrorState message={t('track.notFound', { ref })} />
        ) : (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ))}
      {q.data && (
        <>
          <section className="flex flex-col gap-3 rounded-xl bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-xl font-bold">{q.data.reference_code}</p>
              <StatusBadge status={q.data.status} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-muted">{t('track.type')}</dt>
              <dd><LeakTypeLabel type={q.data.leak_type} /></dd>
              <dt className="text-ink-muted">{t('track.area')}</dt>
              <dd>{[q.data.address_text, q.data.area_name].filter(Boolean).join(', ') || '—'}</dd>
              <dt className="text-ink-muted">{t('track.reported')}</dt>
              <dd>{formatDateTime(q.data.created_at, i18n.language)}</dd>
            </dl>
            {q.data.others_reported > 0 && <Notice>{t('track.others', { count: q.data.others_reported })}</Notice>}
          </section>

          <section className="rounded-xl bg-surface p-5">
            <h2 className="mb-1 font-semibold">{t('track.progress')}</h2>
            {q.data.status !== 'fixed' && q.data.status !== 'invalid' && (
              <p className="mb-4 text-sm text-ink-muted">{t('report.done.typical', { time: duration(q.data.typical_fix_hours, t) })}</p>
            )}
            <Timeline status={q.data.status} events={q.data.events} />
          </section>

          <div className="flex items-center justify-between gap-2 text-sm text-ink-muted">
            <span aria-live="polite">{t('track.updated', { time: formatDateTime(new Date(q.dataUpdatedAt).toISOString(), i18n.language) })}</span>
            <Button variant="ghost" size="sm" onClick={() => void q.refetch()} loading={q.isFetching} icon={<IconRefresh size={16} />}>
              {t('track.refresh')}
            </Button>
          </div>
          <ButtonLink to="/report" variant="secondary">{t('report.done.another')}</ButtonLink>
        </>
      )}
    </CitizenShell>
  );
}
