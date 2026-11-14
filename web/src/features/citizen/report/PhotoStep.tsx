import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { CitizenShell } from '../../../components/ui/Layout';
import { IconCamera, IconImage, IconArrowRight } from '../../../components/ui/Icons';
import { ProgressSteps } from '../../../components/ui/ProgressSteps';
import { Notice } from '../../../components/ui/States';
import { compressImage, formatBytes } from '../../../lib/image';
import { useFlow } from './ReportFlow';

export default function PhotoStep() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { draft, update } = useFlow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (draft.photo ? URL.createObjectURL(draft.photo) : null), [draft.photo]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  // Start loading the map while the citizen takes the photo.
  useEffect(() => {
    void import('../../../components/map/LocationPicker');
  }, []);

  const onFile = async (file?: File) => {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError(t('report.photo.notImage'));
      return;
    }
    setBusy(true);
    try {
      const blob = await compressImage(file);
      update({ photo: blob, noPhoto: false });
    } catch {
      setError(t('report.photo.error'));
    } finally {
      setBusy(false);
    }
  };

  const steps = [t('report.steps.photo'), t('report.steps.location'), t('report.steps.details')];
  return (
    <CitizenShell
      title={t('report.title')}
      back={{ to: '/', label: t('app.back') }}
      bottom={
        <>
          <Button size="lg" block disabled={!draft.photo || busy} onClick={() => nav('/report/location')} icon={<IconArrowRight />}>
            {t('report.continue')}
          </Button>
          <Button
            variant="ghost"
            block
            onClick={() => {
              update({ photo: undefined, noPhoto: true });
              nav('/report/location');
            }}
          >
            {t('report.photo.skip')}
          </Button>
        </>
      }
    >
      <ProgressSteps step={1} total={3} labels={steps} />
      <div>
        <h2 className="text-2xl font-bold">{t('report.photo.title')}</h2>
        <p className="mt-1 text-ink-muted">{t('report.photo.lead')}</p>
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => void onFile(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => void onFile(e.target.files?.[0])} />

      {busy && (
        <div role="status" className="flex items-center gap-3 rounded-lg bg-surface p-4">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
          {t('report.photo.preparing')}
        </div>
      )}

      {preview && !busy ? (
        <figure className="flex flex-col gap-3">
          <img src={preview} alt={t('report.photo.alt')} className="max-h-[42vh] w-full rounded-lg object-cover" />
          <figcaption className="text-sm text-ink-muted" role="status">
            {t('report.photo.ready', { size: formatBytes(draft.photo!.size) })}
          </figcaption>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => cameraRef.current?.click()} icon={<IconCamera size={20} />}>
              {t('report.photo.retake')}
            </Button>
            <Button variant="secondary" onClick={() => update({ photo: undefined })}>
              {t('report.photo.remove')}
            </Button>
          </div>
        </figure>
      ) : (
        !busy && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-brand-500 bg-brand-50 text-brand-700 hover:bg-brand-100 focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus"
            >
              <IconCamera size={48} />
              <span className="text-lg font-semibold">{t('report.photo.take')}</span>
            </button>
            <Button variant="secondary" onClick={() => galleryRef.current?.click()} icon={<IconImage size={20} />}>
              {t('report.photo.choose')}
            </Button>
          </div>
        )
      )}
      {error && <p role="alert" className="font-medium text-danger-700">{error}</p>}
      <Notice>{t('report.photo.tip')}</Notice>
    </CitizenShell>
  );
}
