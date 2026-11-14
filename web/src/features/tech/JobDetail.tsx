import { lazy, Suspense, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { leakName, SeverityBadge, StatusBadge } from '../../components/ui/Badges';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, TextArea } from '../../components/ui/Field';
import { IconExternal, IconPin, IconWarning } from '../../components/ui/Icons';
import { CitizenShell } from '../../components/ui/Layout';
import { ErrorState, ListSkeleton, Skeleton } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { directionsUrl, formatWhen } from '../../lib/format';
import type { Job } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';

const MiniMap = lazy(() => import('../../components/map/MiniMap'));

export function useJob(id: string) {
  return useQuery({ queryKey: ['job', id], queryFn: () => api<Job>(`/tech/jobs/${id}`) });
}

function FollowUpDialog({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { register, handleSubmit, formState, reset } = useForm<{ reason: string }>({
    resolver: zodResolver(z.object({ reason: z.string().trim().min(3, t('detail.reasonRequired')).max(500) })),
  });
  const send = useMutation({
    mutationFn: (reason: string) => api<Job>(`/tech/jobs/${id}/follow-up`, { method: 'POST', json: { reason } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      void qc.invalidateQueries({ queryKey: ['job', id] });
      toast({ tone: 'success', message: t('tech.followUpSent') });
      nav('/tech');
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });
  const close = () => { reset(); onClose(); };
  return (
    <Dialog open={open} onClose={close} title={t('tech.followUpTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
          <Button loading={send.isPending} onClick={() => void handleSubmit((v) => send.mutate(v.reason))()}>{t('tech.followUpSend')}</Button>
        </>
      }>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">{t('tech.followUpBody')}</p>
        <Field label={t('tech.followUpReason')} hint={t('tech.followUpHint')} error={formState.errors.reason?.message}>
          {({ id: fid, describedBy, invalid }) => <TextArea id={fid} aria-describedby={describedBy} invalid={invalid} rows={3} {...register('reason')} />}
        </Field>
      </div>
    </Dialog>
  );
}

export default function JobDetail() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const q = useJob(id);
  const [followUp, setFollowUp] = useState(false);
  const start = useMutation({
    mutationFn: () => api<Job>(`/tech/jobs/${id}/status`, { method: 'PATCH', json: { status: 'in_progress' } }),
    onSuccess: (job) => {
      qc.setQueryData(['job', id], job);
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      toast({ tone: 'success', message: t('tech.started') });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });
  const j = q.data;
  const open = j && j.status !== 'fixed' && j.status !== 'invalid';
  const before = j?.photos.find((p) => p.kind === 'before');
  const after = j?.photos.filter((p) => p.kind === 'after') ?? [];

  return (
    <CitizenShell
      menu="technician"
      title={t('tech.jobDetails')}
      back={{ to: '/tech', label: t('app.back') }}
      bottom={
        open ? (
          <>
            {j.status === 'in_progress' ? (
              <ButtonLink to={`/tech/jobs/${id}/fix`} size="lg" block>{t('tech.markFixed')}</ButtonLink>
            ) : (
              <>
                <Button size="lg" block loading={start.isPending} onClick={() => start.mutate()}>{t('tech.startJob')}</Button>
                <ButtonLink to={`/tech/jobs/${id}/fix`} variant="outline" size="lg" block>{t('tech.markFixed')}</ButtonLink>
              </>
            )}
            <button type="button" onClick={() => setFollowUp(true)}
              className="min-h-touch rounded font-semibold text-ink hover:underline focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
              {t('tech.cantFix')}
            </button>
          </>
        ) : undefined
      }
    >
      {q.isLoading && (
        <div className="flex flex-col gap-4" role="status" aria-label={t('tech.loading')}>
          <Skeleton className="aspect-[16/9] w-full rounded-xl" />
          <ListSkeleton rows={2} />
        </div>
      )}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      {j && (
        <>
          {before && (
            <img src={before.url} className="aspect-[16/9.5] w-full rounded-xl object-cover"
              alt={t('detail.photoAltBefore', { type: leakName(t, j.leak_type, j.is_main), label: before.ai_labels ? t(`aiLabel.${before.ai_labels.top.label}`) : '—' })} />
          )}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <SeverityBadge severity={j.severity} plain />
              {j.status !== 'scheduled' && j.status !== 'verified' && <StatusBadge status={j.status} size="sm" />}
            </div>
            <h2 className="text-[1.6rem] font-normal leading-tight tracking-tight text-ink-heading">{leakName(t, j.leak_type, j.is_main)}</h2>
            <p className="flex items-start gap-1.5 text-[15px] text-ink-muted">
              <IconPin size={18} className="mt-0.5 shrink-0" />
              {j.address_text || j.zone_name || '—'}
            </p>
            <p className="text-sm text-ink-subtle">
              {j.reference_code}
              {j.assignee_due_at && <> · {t('tech.due', { when: formatWhen(j.assignee_due_at, t, i18n.language) })}</>}
              {j.duplicate_count > 0 && <> · {t('tech.others', { count: j.duplicate_count })}</>}
            </p>
          </section>

          <a href={directionsUrl(j.lat, j.lng)} target="_blank" rel="noreferrer" className="group relative block h-36 overflow-hidden rounded-xl focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
            <Suspense fallback={<Skeleton className="h-full w-full" />}>
              <MiniMap lat={j.lat} lng={j.lng} />
            </Suspense>
            <span className="absolute bottom-2 right-2 z-[500] inline-flex items-center gap-1 rounded-lg bg-surface px-2.5 py-1.5 text-sm font-semibold text-brand-700 shadow">
              {t('tech.directions')} <IconExternal size={14} />
            </span>
          </a>

          {j.description && (
            <div className="rounded-xl bg-surface-muted p-4">
              <p className="text-sm font-semibold text-ink">{t('detail.citizenNote')}</p>
              <p className="mt-1 text-sm text-ink-muted">{j.description}</p>
            </div>
          )}
          {j.needs_review && j.review_reason && (
            <div className="flex items-start gap-2 rounded-xl border border-warning-800/30 bg-warning-50 p-4 text-sm text-warning-800">
              <IconWarning size={18} className="mt-0.5 shrink-0" />
              <span>{j.review_reason}</span>
            </div>
          )}
          {after.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">{t('detail.photoKind.after')}</p>
              <div className="flex gap-2 overflow-x-auto">
                {after.map((p) => (
                  <img key={p.id} src={p.url} className="h-24 w-32 shrink-0 rounded-lg object-cover" alt={t('tech.altAfter', { ref: j.reference_code })} />
                ))}
              </div>
            </div>
          )}
          <FollowUpDialog id={id} open={followUp} onClose={() => setFollowUp(false)} />
        </>
      )}
    </CitizenShell>
  );
}
