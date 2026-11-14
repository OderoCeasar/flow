import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Field, TextInput } from '../../../components/ui/Field';
import { CitizenShell } from '../../../components/ui/Layout';
import { IconCheck, IconNavigation, IconPin, IconWarning } from '../../../components/ui/Icons';
import { ProgressSteps } from '../../../components/ui/ProgressSteps';
import { Skeleton } from '../../../components/ui/States';
import { api } from '../../../lib/api';
import type { NearbyMatch } from '../../../lib/types';
import { NAIROBI_CENTER } from './constants';
import { useFlow } from './ReportFlow';
import { DuplicateSheet } from './DuplicateSheet';

const LocationPicker = lazy(() => import('../../../components/map/LocationPicker'));

type GpsState = 'idle' | 'finding' | 'found' | 'failed';

interface Address {
  road?: string;
  place?: string;
  area?: string;
  city?: string;
}

export function useAddressLines() {
  const { t } = useTranslation();
  return (a?: Address) => {
    if (!a) return { line1: '', line2: '' };
    const line1 = a.road && a.place ? t('report.location.roadNear', { road: a.road, place: a.place }) : a.road || a.place || '';
    const line2 = [a.area, a.city].filter(Boolean).join(', ');
    return { line1, line2 };
  };
}

export default function LocationStep() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { draft, update } = useFlow();
  const lines = useAddressLines();
  const [gps, setGps] = useState<GpsState>(draft.lat != null ? 'found' : 'idle');
  const [failure, setFailure] = useState('');
  const [showLandmark, setShowLandmark] = useState(!!draft.addressText);

  const locate = useCallback(() => {
    const fallback = (msg: string) => {
      setGps('failed');
      setFailure(msg);
      if (draft.lat == null) update({ lat: NAIROBI_CENTER[0], lng: NAIROBI_CENTER[1], locationSource: 'pin' });
    };
    if (!('geolocation' in navigator)) {
      fallback(t('report.location.unsupported'));
      return;
    }
    setGps('finding');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps('found');
        update({ lat: pos.coords.latitude, lng: pos.coords.longitude, locationSource: 'gps' });
      },
      (err) => fallback(err.code === err.PERMISSION_DENIED ? t('report.location.denied') : t('report.location.failed')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }, [draft.lat, t, update]);

  useEffect(() => {
    if (draft.lat == null) locate();
    // run once on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ~11 m rounding keeps lookups cached while the pin is nudged.
  const lat = draft.lat != null ? Math.round(draft.lat * 1e4) / 1e4 : undefined;
  const lng = draft.lng != null ? Math.round(draft.lng * 1e4) / 1e4 : undefined;
  const ready = lat != null && lng != null && gps !== 'finding';
  const coverage = useQuery({
    queryKey: ['coverage', lat, lng],
    queryFn: () => api<{ covered: boolean; matches: NearbyMatch[] }>(`/reports/nearby?lat=${lat}&lng=${lng}`),
    enabled: ready,
    staleTime: 5 * 60_000,
  });
  const address = useQuery({
    queryKey: ['geocode', lat, lng],
    queryFn: () => api<Address>(`/geocode/reverse?lat=${lat}&lng=${lng}`),
    enabled: ready,
    staleTime: Infinity,
    retry: false,
  });
  const outside = coverage.data && !coverage.data.covered;
  const { line1, line2 } = lines(address.data);

  const [sheet, setSheet] = useState<NearbyMatch | null>(null);
  const goOn = (join?: NearbyMatch) => {
    setSheet(null);
    // Keep what the citizen typed; otherwise save the looked-up address for the crew.
    const addressText = draft.addressText?.trim() ? draft.addressText : [line1, address.data?.area].filter(Boolean).join(', ');
    update({ addressText, joinClusterId: join?.cluster_id, joinRef: join?.reference_code });
    nav('/report/details');
  };
  const confirm = () => {
    // Someone already reported a leak right here: ask before making a new one.
    const nearest = coverage.data?.matches[0];
    if (nearest) setSheet(nearest);
    else goOn();
  };

  const steps = [t('report.steps.photo'), t('report.steps.location'), t('report.steps.details')];
  return (
    <CitizenShell
      padded={false}
      back={{ to: '/report', label: t('app.back') }}
      bottom={
        <Button size="lg" block disabled={draft.lat == null || gps === 'finding' || !!outside} onClick={confirm}>
          {t('report.location.confirm')}
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-2xl lg:pt-4">
      <div className="flex flex-col gap-4 px-5 pt-6 lg:px-8">
        <ProgressSteps step={2} total={3} labels={steps} />
        <h1 className="sr-only">{t('report.location.title')}</h1>
        <div aria-live="polite">
          {gps === 'finding' && (
            <p role="status" className="flex items-center gap-3 rounded-xl bg-surface-muted p-4 font-medium">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
              {t('report.location.finding')}
            </p>
          )}
          {gps === 'found' && !outside && (
            <div className="flex items-start gap-3 rounded-xl bg-accent-50 p-4 text-accent-800">
              <IconCheck size={20} className="mt-0.5 shrink-0 text-accent-700" />
              <p>
                <span className="block font-semibold">{t('report.location.found')}</span>
                {t('report.location.foundHint')}
              </p>
            </div>
          )}
          {(gps === 'failed' || outside) && (
            <div role="alert" className="flex items-start gap-3 rounded-xl bg-warning-50 p-4 text-warning-800">
              <IconWarning size={20} className="mt-0.5 shrink-0" />
              <p>{outside ? t('report.location.outside') : failure}</p>
            </div>
          )}
        </div>
      </div>

      <div className="relative mt-4 h-[clamp(220px,36dvh,340px)] sm:mx-5 sm:h-[420px] sm:overflow-hidden sm:rounded-xl lg:mx-8">
        <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
          <LocationPicker
            bleed
            lat={draft.lat}
            lng={draft.lng}
            onChange={(la, ln) => update({ lat: la, lng: ln, locationSource: 'pin' })}
            others={(coverage.data?.matches ?? []).map((m) => ({
              lat: m.lat,
              lng: m.lng,
              label: t('report.location.otherReport', { type: t(`leakType.${m.leak_type ?? 'unknown'}`) }),
            }))}
          />
        </Suspense>
        <button
          type="button"
          onClick={locate}
          disabled={gps === 'finding'}
          aria-label={t('report.location.useMine')}
          title={t('report.location.useMine')}
          className="absolute bottom-10 right-4 z-[1000] flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-brand-700 shadow-md hover:bg-brand-50 focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus disabled:opacity-60"
        >
          <IconNavigation size={22} />
        </button>
      </div>

      <div className="relative z-[1000] mx-4 -mt-6 flex items-start gap-3 sm:mx-9 lg:mx-12 rounded-xl border border-surface-line bg-surface p-4 shadow-md">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <IconPin size={22} />
        </span>
        <div className="flex min-w-0 flex-col" aria-live="polite">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">{t('report.location.cardLabel')}</p>
          {address.isLoading && ready ? (
            <p className="text-ink-muted">{t('report.location.looking')}</p>
          ) : (
            <>
              <p className="font-semibold text-ink">{line1 || t('report.location.noAddress')}</p>
              {line2 && <p className="text-sm text-ink-muted">{line2}</p>}
            </>
          )}
        </div>
      </div>

      <div className="px-5 pb-6 pt-4 lg:px-8">
        {showLandmark ? (
          <Field label={t('report.location.landmark')} hint={t('report.location.landmarkHint')} optional>
            {({ id, describedBy }) => (
              <TextInput id={id} aria-describedby={describedBy} value={draft.addressText ?? ''} maxLength={200} autoFocus
                onChange={(e) => update({ addressText: e.target.value })} />
            )}
          </Field>
        ) : (
          <button type="button" onClick={() => setShowLandmark(true)}
            className="min-h-touch rounded font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
            + {t('report.location.addLandmark')}
          </button>
        )}
      </div>
      </div>
      <DuplicateSheet match={sheet} onSame={(m) => goOn(m)} onDifferent={() => goOn()} onClose={() => setSheet(null)} />
    </CitizenShell>
  );
}
