import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, buttonClass } from '../../components/ui/Button';
import { LeakTypeLabel, PriorityScore, SeverityBadge, StatusBadge } from '../../components/ui/Badges';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { IconCamera, IconCheck, IconExternal, IconWrench } from '../../components/ui/Icons';
import { EmptyState, ErrorState, ListSkeleton } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { api, upload } from '../../lib/api';
import { directionsUrl, formatDateTime, timeAgo } from '../../lib/format';
import { compressImage } from '../../lib/image';
import type { Job } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { StaffShell } from '../staff/StaffShell';

function JobCard({ job }: { job: Job }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [confirmFix, setConfirmFix] = useState(false);
  const afterPhotos = job.photos.filter((p) => p.kind === 'after');

  const setStatus = useMutation({
    mutationFn: (status: string) => api<Job>(`/tech/jobs/${job.id}/status`, { method: 'PATCH', json: { status } }),
    onSuccess: (_, status) => {
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      toast({ tone: 'success', message: t(status === 'fixed' ? 'tech.markedFixed' : 'tech.started') });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });

  const onPhoto = async (file?: File) => {
    if (!file) return;
    try {
      setProgress(0);
      const blob = await compressImage(file);
      const form = new FormData();
      form.append('photo', blob, 'after.jpg');
      await upload<Job>(`/tech/jobs/${job.id}/photos`, form, setProgress);
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      toast({ tone: 'success', message: t('tech.photoAdded') });
    } catch (e) {
      toast({ tone: 'error', message: errorMessage(e) });
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-surface p-4">
      <div className="flex items-start gap-3">
        <PriorityScore score={job.priority_score} />
        <div className="flex flex-1 flex-col gap-1">
          <h2 className="font-semibold"><LeakTypeLabel type={job.leak_type} /></h2>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={job.severity} size="sm" />
            <StatusBadge status={job.status} size="sm" />
          </div>
        </div>
      </div>
      <p className="text-ink">{[job.address_text, job.zone_name].filter(Boolean).join(', ')}</p>
      <p className="text-sm text-ink-muted">
        <span className="font-mono">{job.reference_code}</span> · {t('tech.reported', { when: timeAgo(job.created_at, t) })}
        {job.assignee_due_at && <> · {t('tech.due', { when: formatDateTime(job.assignee_due_at, i18n.language) })}</>}
        {job.duplicate_count > 0 && <> · {t('tech.others', { count: job.duplicate_count })}</>}
      </p>
      {job.description && <p className="rounded bg-surface-muted p-2 text-sm">“{job.description}”</p>}
      {job.photos.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto">
          {job.photos.map((p) => (
            <li key={p.id} className="shrink-0">
              <img src={p.url} loading="lazy" className="h-20 w-28 rounded object-cover"
                alt={t(p.kind === 'after' ? 'tech.altAfter' : 'tech.altBefore', { ref: job.reference_code })} />
            </li>
          ))}
        </ul>
      )}
      <a href={directionsUrl(job.lat, job.lng)} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'md', true)}>
        {t('tech.directions')} <IconExternal size={18} />
      </a>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => void onPhoto(e.target.files?.[0])} />
      {job.status !== 'fixed' && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {job.status === 'in_progress' ? (
            <>
              <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={progress !== null} icon={<IconCamera size={20} />}>
                {progress !== null ? t('report.uploading', { pct: progress }) : t('tech.addPhoto')}
              </Button>
              <Button onClick={() => (afterPhotos.length ? setStatus.mutate('fixed') : setConfirmFix(true))} loading={setStatus.isPending} icon={<IconCheck size={20} />}>
                {t('tech.markFixed')}
              </Button>
            </>
          ) : (
            <Button className="sm:col-span-2" onClick={() => setStatus.mutate('in_progress')} loading={setStatus.isPending} icon={<IconWrench size={20} />}>
              {t('tech.start')}
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog open={confirmFix} title={t('tech.noPhotoTitle')} body={t('tech.noPhotoBody')} confirmLabel={t('tech.fixAnyway')}
        onCancel={() => setConfirmFix(false)}
        onConfirm={() => { setConfirmFix(false); setStatus.mutate('fixed'); }} />
    </li>
  );
}

export default function Jobs() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [showDone, setShowDone] = useState(false);
  const q = useQuery({
    queryKey: ['jobs', showDone],
    queryFn: () => api<{ items: Job[] }>(`/tech/jobs${showDone ? '?include_done=true' : ''}`),
    refetchInterval: 60_000,
  });
  return (
    <StaffShell wide={false}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{t('tech.title')}</h1>
          <label className="flex min-h-touch items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            {t('tech.showDone')}
          </label>
        </div>
        {q.isLoading && <ListSkeleton rows={3} label={t('tech.loading')} />}
        {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
        {q.data && (q.data.items.length === 0 ? (
          <EmptyState title={t('tech.emptyTitle')} body={t('tech.emptyBody')} icon={<IconCheck size={36} />} />
        ) : (
          <ul className="flex flex-col gap-3">{q.data.items.map((j) => <JobCard key={j.id} job={j} />)}</ul>
        ))}
      </div>
    </StaffShell>
  );
}
