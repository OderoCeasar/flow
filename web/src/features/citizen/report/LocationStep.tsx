import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Field, TextInput } from '../../../components/ui/Field';
import { CitizenShell } from '../../../components/ui/Layout';
import { IconArrowRight, IconCrosshair, IconWarning } from '../../../components/ui/Icons';
import { ProgressSteps } from '../../../components/ui/ProgressSteps';
import { Notice, Skeleton } from '../../../components/ui/States';
import { api } from '../../../lib/api';
import type { NearbyMatch } from '../../../lib/types';
import { NAIROBI_CENTER } from './constants';
import { useFlow } from './ReportFlow';

const LocationPicker = lazy(() => import('../../../components/map/LocationPicker'));

type GpsState = 'idle' | 'finding' | 'found' | 'failed';

export default function LocationStep() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { draft, update } = useFlow();
  const [gps, setGps] = useState<GpsState>(draft.lat != null ? 'found' : 'idle');
  const [accuracy, setAccuracy] = useState<number>();
  const [failure, setFailure] = useState('');

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGps('failed');
      setFailure(t('report.location.unsupported'));
      if (draft.lat == null) update({ lat: NAIROBI_CENTER[0], lng: NAIROBI_CENTER[1], locationSource: 'pin' });
      return;
    }
    setGps('finding');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps('found');
        setAccuracy(Math.round(pos.coords.accuracy));
        update({ lat: pos.coords.latitude, lng: pos.coords.longitude, locationSource: 'gps' });
      },
      (err) => {
        setGps('failed');
        setFailure(err.code === err.PERMISSION_DENIED ? t('report.location.denied') : t('report.location.failed'));
        if (draft.lat == null) update({ lat: NAIROBI_CENTER[0], lng: NAIROBI_CENTER[1], locationSource: 'pin' });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }, [draft.lat, t, update]);

  useEffect(() => {
    if (draft.lat == null) locate();
    // run once on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coverage check: is this spot inside the utility's area?
  const lat = draft.lat != null ? Math.round(draft.lat * 1e4) / 1e4 : undefined;
  const lng = draft.lng != null ? Math.round(draft.lng * 1e4) / 1e4 : undefined;
  const coverage = useQuery({
    queryKey: ['coverage', lat, lng],
    queryFn: () => api<{ covered: boolean; matches: NearbyMatch[] }>(`/reports/nearby?lat=${lat}&lng=${lng}`),
    enabled: lat != null && lng != null,
    staleTime: 5 * 60_000,
  });
  const outside = coverage.data && !coverage.data.covered;

  const steps = [t('report.steps.photo'), t('report.steps.location'), t('report.steps.details')];
  return (
    <CitizenShell
      title={t('report.title')}
      back={{ to: '/report', label: t('app.back') }}
      bottom={
        <Button size="lg" block disabled={draft.lat == null || gps === 'finding' || !!outside} onClick={() => nav('/report/details')} icon={<IconArrowRight />}>
          {t('report.location.confirm')}
        </Button>
      }
    >
      <ProgressSteps step={2} total={3} labels={steps} />
      <div>
        <h2 className="text-2xl font-bold">{t('report.location.title')}</h2>
        <p className="mt-1 text-ink-muted">{t('report.location.lead')}</p>
      </div>

      <div aria-live="polite">
        {gps === 'finding' && (
          <p role="status" className="flex items-center gap-2 font-medium">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
            {t('report.location.finding')}
          </p>
        )}
        {gps === 'found' && accuracy != null && <p className="text-sm text-ink-muted">{t('report.location.accuracy', { m: accuracy })}</p>}
        {gps === 'failed' && (
          <Notice tone="warning">
            <IconWarning size={18} className="mt-0.5 shrink-0" />
            <span>{failure}</span>
          </Notice>
        )}
      </div>

      <Suspense fallback={<Skeleton className="h-[46vh] min-h-[260px] w-full" />}>
        <LocationPicker lat={draft.lat} lng={draft.lng} onChange={(la, ln) => update({ lat: la, lng: ln, locationSource: 'pin' })} />
      </Suspense>
      <p className="text-sm text-ink-muted">{t('report.location.dragHint')}</p>

      {outside && (
        <div role="alert">
          <Notice tone="warning">
            <IconWarning size={18} className="mt-0.5 shrink-0" />
            <span>{t('report.location.outside')}</span>
          </Notice>
        </div>
      )}

      <Button variant="secondary" onClick={locate} icon={<IconCrosshair size={20} />} disabled={gps === 'finding'}>
        {t('report.location.useMine')}
      </Button>

      <Field label={t('report.location.landmark')} hint={t('report.location.landmarkHint')} optional>
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            value={draft.addressText ?? ''}
            maxLength={200}
            autoComplete="street-address"
            onChange={(e) => update({ addressText: e.target.value })}
          />
        )}
      </Field>
    </CitizenShell>
  );
}
