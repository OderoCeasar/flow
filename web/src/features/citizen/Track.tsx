import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badges';
import { Field, TextInput } from '../../components/ui/Field';
import { CitizenShell, PageHeading } from '../../components/ui/Layout';
import { IconPin, IconRefresh, IconSearch, IconUsers } from '../../components/ui/Icons';
import { ErrorState, ListSkeleton, Skeleton } from '../../components/ui/States';
import { Timeline } from '../../components/ui/Timeline';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { duration, formatWhen } from '../../lib/format';
import type { PublicStatus } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';

function FindReport() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { register, handleSubmit, formState } = useForm<{ ref: string }>({
    resolver: zodResolver(z.object({ ref: z.string().trim().min(5, t('track.refRequired')) })),
  });
  return (
    <CitizenShell title={t('track.findHeader')} back={{ to: '/', label: t('app.back') }}>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
        <IconSearch size={26} />
      </span>
      <PageHeading as="h2" title={t('track.findTitle')} lead={t('track.findLead')} />
      <form className="flex flex-col gap-4" noValidate
        onSubmit={(e) => void handleSubmit((v) => nav(`/track/${encodeURIComponent(v.ref.trim().toUpperCase())}`))(e)}>
        <Field label={t('track.refLabel')} error={formState.errors.ref?.message}>
          {({ id, describedBy, invalid }) => (
            <TextInput id={id} aria-describedby={describedBy} invalid={invalid} placeholder="FLW-7K3QPX" autoCapitalize="characters"
              autoComplete="off" spellCheck={false} className="font-semibold tracking-wide" {...register('ref')} />
          )}
        </Field>
        <Button type="submit" size="lg" block icon={<IconSearch size={20} />}>
          {t('track.findButton')}
        </Button>
      </form>
      <div className="mt-2 rounded-xl bg-surface-muted p-4">
        <p className="text-sm font-semibold text-ink">{t('track.whereTitle')}</p>
        <p className="mt-1 text-sm text-ink-muted">{t('track.whereBody')}</p>
      </div>
    </CitizenShell>
  );
}

function Photos({ photos, alt }: { photos: PublicStatus['photos']; alt: (kind: 'before' | 'after') => string }) {
  const { t } = useTranslation();
  if (!photos.length) return null;
  const both = photos.length > 1;
  return (
    <div className={`grid gap-2 ${both ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {photos.map((p) => (
        <figure key={p.kind} className="relative overflow-hidden rounded-xl bg-surface-muted">
          <img src={p.url} alt={alt(p.kind)} loading="lazy" className={`w-full object-cover ${both ? 'aspect-[4/3.6]' : 'aspect-[16/9]'}`} />
          {both && (
            <figcaption className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-0.5 text-xs font-semibold text-white">
              {t(p.kind === 'before' ? 'track.before' : 'track.after')}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

function FeedbackCard({ status }: { status: PublicStatus }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [editing, setEditing] = useState(false);
  const send = useMutation({
    mutationFn: (fixed: boolean) =>
      api<PublicStatus>(`/reports/${encodeURIComponent(status.reference_code)}/feedback`, { method: 'POST', json: { fixed } }),
    onSuccess: (res) => {
      qc.setQueryData(['track', status.reference_code], res);
      setEditing(false);
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });
  const answered = status.feedback && !editing;
  return (
    <section aria-labelledby="feedback-title" className="rounded-xl border border-brand-100 bg-[#f5f9fd] p-5">
      <h2 id="feedback-title" className="text-xl font-normal text-ink-heading">{t('track.feedbackTitle')}</h2>
      {answered ? (
        <div className="mt-2 flex flex-col items-start gap-2" role="status">
          <p className="text-ink">{status.feedback === 'fixed' ? t('track.thanksYes') : t('track.thanksNo')}</p>
          <button type="button" onClick={() => setEditing(true)}
            className="min-h-touch rounded text-sm font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
            {t('track.feedbackChange')}
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-muted">{t('track.feedbackBody')}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button variant="outline" className="min-h-[52px] px-2" loading={send.isPending && send.variables === true} onClick={() => send.mutate(true)}>
              {t('track.feedbackYes')}
            </Button>
            <Button variant="outline" className="min-h-[52px] px-2" loading={send.isPending && send.variables === false} onClick={() => send.mutate(false)}>
              {t('track.feedbackNo')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function ReportStatus({ refCode }: { refCode: string }) {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const q = useQuery({
    queryKey: ['track', refCode],
    queryFn: () => api<PublicStatus>(`/reports/${encodeURIComponent(refCode)}`),
    refetchInterval: 60_000,
  });
  const s = q.data;
  const leakName = s ? t(`leakType.${s.leak_type ?? 'unknown'}`) : '';
  return (
    <CitizenShell title={t('track.title')} back={{ to: '/track', label: t('app.back') }}>
      {q.isLoading && (
        <div className="flex flex-col gap-4" role="status" aria-label={t('track.loading')}>
          <Skeleton className="aspect-[16/9] w-full rounded-xl" />
          <ListSkeleton rows={2} />
        </div>
      )}
      {q.isError &&
        (q.error instanceof ApiError && q.error.status === 404 ? (
          <ErrorState message={t('track.notFound', { ref: refCode })} />
        ) : (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ))}
      {s && (
        <>
          <Photos photos={s.photos} alt={(kind) => t(kind === 'after' ? 'track.photoAltAfter' : 'track.photoAltBefore', { type: leakName })} />

          <section className="flex flex-col gap-2">
            <p className="text-sm font-bold tracking-wider text-brand-700">{s.reference_code}</p>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[1.75rem] font-normal leading-tight tracking-tight text-ink-heading">{leakName}</h2>
              <span className="mt-1 shrink-0"><StatusBadge status={s.status} size="sm" /></span>
            </div>
            {(s.address_text || s.area_name) && (
              <p className="flex items-start gap-1.5 text-[15px] text-ink-muted">
                <IconPin size={18} className="mt-0.5 shrink-0" />
                <span>{s.address_text || s.area_name}</span>
              </p>
            )}
          </section>

          {s.others_reported > 0 && s.status !== 'fixed' && (
            <div className="flex items-start gap-3 rounded-xl bg-[#f1f6fa] p-4">
              <IconUsers size={22} className="mt-0.5 shrink-0 text-brand-700" />
              <div>
                <p className="font-semibold text-brand-700">{t('track.othersTitle', { count: s.others_reported })}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{t('track.othersBody')}</p>
              </div>
            </div>
          )}

          <section aria-labelledby="progress-title" className="flex flex-col gap-4">
            <div>
              <h2 id="progress-title" className="text-xl font-normal text-ink-heading">{t('track.progress')}</h2>
              {s.status !== 'fixed' && s.status !== 'invalid' && (
                <p className="mt-1 text-sm text-ink-muted">{t('report.done.typical', { time: duration(s.typical_fix_hours, t) })}</p>
              )}
            </div>
            <Timeline status={s.status} events={s.events} />
          </section>

          {s.status === 'fixed' && <FeedbackCard status={s} />}

          <div className="flex items-center justify-between gap-2 text-sm text-ink-muted">
            <span aria-live="polite">{t('track.updated', { time: formatWhen(new Date(q.dataUpdatedAt).toISOString(), t, i18n.language) })}</span>
            <Button variant="ghost" size="sm" onClick={() => void q.refetch()} loading={q.isFetching} icon={<IconRefresh size={16} />}>
              {t('track.refresh')}
            </Button>
          </div>
        </>
      )}
    </CitizenShell>
  );
}

export default function Track() {
  const { ref } = useParams();
  return ref ? <ReportStatus refCode={ref} /> : <FindReport />;
}
