import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { CitizenShell, PageHeading } from '../../../components/ui/Layout';
import { IconArrowRight, IconCamera, IconImage } from '../../../components/ui/Icons';
import { ProgressSteps } from '../../../components/ui/ProgressSteps';
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
      back={{ to: '/', label: t('app.back') }}
      bottom={
        draft.photo && !busy ? (
          <Button size="lg" block onClick={() => nav('/report/location')} icon={<IconArrowRight />}>
            {t('report.continue')}
          </Button>
        ) : undefined
      }
    >
      <ProgressSteps step={1} total={3} labels={steps} />
      <PageHeading title={t('report.photo.title')} lead={t('report.photo.lead')} />

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => void onFile(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => void onFile(e.target.files?.[0])} />

      {busy ? (
        <div role="status" className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-brand-200 bg-[#f1f7fb] text-brand-700">
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-600 border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
          {t('report.photo.preparing')}
        </div>
      ) : preview ? (
        <figure className="flex flex-col gap-3">
          <img src={preview} alt={t('report.photo.alt')} className="aspect-[4/3] w-full rounded-xl object-cover" />
          <figcaption className="text-sm text-ink-muted" role="status">
            {t('report.photo.ready', { size: formatBytes(draft.photo!.size) })}
          </figcaption>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => cameraRef.current?.click()} icon={<IconCamera size={20} />}>
              {t('report.photo.retake')}
            </Button>
            <Button variant="outline" onClick={() => update({ photo: undefined })}>
              {t('report.photo.remove')}
            </Button>
          </div>
        </figure>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 bg-[#f1f7fb] text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus motion-reduce:transition-none"
          >
            <span className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-[#dcebf5]">
              <IconCamera size={30} />
            </span>
            <span className="text-lg font-semibold">{t('report.photo.take')}</span>
            <span className="text-sm text-ink-muted">{t('report.photo.takeHint')}</span>
          </button>
          <Button variant="outline" size="lg" block onClick={() => galleryRef.current?.click()} icon={<IconImage size={20} />}>
            {t('report.photo.choose')}
          </Button>
          <button
            type="button"
            onClick={() => {
              update({ photo: undefined, noPhoto: true });
              nav('/report/location');
            }}
            className="min-h-touch rounded text-[17px] font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus"
          >
            {t('report.photo.skip')}
          </button>
        </div>
      )}
      {error && <p role="alert" className="font-medium text-danger-700">{error}</p>}
    </CitizenShell>
  );
}
