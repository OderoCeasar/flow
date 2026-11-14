import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { TextArea } from '../../components/ui/Field';
import { IconCamera } from '../../components/ui/Icons';
import { CitizenShell, PageHeading } from '../../components/ui/Layout';
import { useToast } from '../../components/ui/Toast';
import { api, upload } from '../../lib/api';
import { compressImage, formatBytes } from '../../lib/image';
import type { Job } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { useJob } from './JobDetail';

export default function MarkFixed() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const job = useJob(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<Blob>();
  const [preparing, setPreparing] = useState(false);
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState<string>();
  const [confirmNoPhoto, setConfirmNoPhoto] = useState(false);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const choose = async (file?: File) => {
    if (!file) return;
    setPreparing(true);
    try {
      setPhoto(await compressImage(file));
    } catch {
      toast({ tone: 'error', message: t('report.photo.error') });
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const finish = async () => {
    try {
      // A scheduled job is started first, so the history shows both steps.
      if (job.data && job.data.status !== 'in_progress') {
        setProgress(t('tech.savingStart'));
        await api<Job>(`/tech/jobs/${id}/status`, { method: 'PATCH', json: { status: 'in_progress' } });
      }
      if (photo) {
        const form = new FormData();
        form.append('photo', photo, 'after.jpg');
        await upload<Job>(`/tech/jobs/${id}/photos`, form, (pct) => setProgress(t('report.uploading', { pct })));
      }
      setProgress(t('tech.savingFixed'));
      await api<Job>(`/tech/jobs/${id}/status`, { method: 'PATCH', json: { status: 'fixed', note: note.trim() } });
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      void qc.invalidateQueries({ queryKey: ['job', id] });
      toast({ tone: 'success', message: t('tech.markedFixed') });
      nav('/tech', { replace: true });
    } catch (e) {
      setProgress(undefined);
      toast({ tone: 'error', message: errorMessage(e) });
    }
  };

  return (
    <CitizenShell
      menu="technician"
      title={t('tech.markFixed')}
      back={{ to: `/tech/jobs/${id}`, label: t('app.back') }}
      bottom={
        <>
          {progress && <p role="status" className="text-center text-sm text-ink-muted">{progress}</p>}
          <Button size="lg" block loading={!!progress} disabled={preparing} onClick={() => (photo ? void finish() : setConfirmNoPhoto(true))}>
            {t('tech.confirmFixed')}
          </Button>
        </>
      }
    >
      <PageHeading as="h2" title={t('tech.afterTitle')} lead={t('tech.afterLead')} />
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => void choose(e.target.files?.[0])} />
      {preparing ? (
        <div role="status" className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-brand-200 bg-[#f1f7fb] text-brand-700">
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-600 border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
          {t('report.photo.preparing')}
        </div>
      ) : preview ? (
        <figure className="flex flex-col gap-2">
          <img src={preview} alt={t('tech.afterPreview')} className="aspect-[4/3] w-full rounded-xl object-cover" />
          <figcaption className="flex items-center justify-between text-sm text-ink-muted">
            <span role="status">{t('report.photo.ready', { size: formatBytes(photo!.size) })}</span>
            <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>{t('report.photo.retake')}</Button>
          </figcaption>
        </figure>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()}
          className="flex min-h-[250px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-brand-300 bg-[#f1f7fb] text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#dcebf5]"><IconCamera size={30} /></span>
          <span className="text-lg font-semibold">{t('tech.takeAfter')}</span>
        </button>
      )}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="work-note" className="font-semibold text-ink">{t('tech.workNote')}</label>
          <span className="text-sm text-ink-muted">{t('tech.optional')}</span>
        </div>
        <TextArea id="work-note" rows={3} maxLength={500} placeholder={t('tech.workNotePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <ConfirmDialog open={confirmNoPhoto} title={t('tech.noPhotoTitle')} body={t('tech.noPhotoBody')} confirmLabel={t('tech.fixAnyway')}
        onCancel={() => setConfirmNoPhoto(false)}
        onConfirm={() => { setConfirmNoPhoto(false); void finish(); }} />
    </CitizenShell>
  );
}
