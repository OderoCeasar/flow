import { lazy } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Route, Routes, useSearchParams } from 'react-router-dom';
import { leakName, SeverityBadge, StatusBadge } from '../../components/ui/Badges';
import { buttonClass } from '../../components/ui/Button';
import { IconCheck, IconChevronDown, IconNavigation, IconPin } from '../../components/ui/Icons';
import { CitizenShell } from '../../components/ui/Layout';
import { EmptyState, ErrorState, ListSkeleton } from '../../components/ui/States';
import { api } from '../../lib/api';
import { directionsUrl, distance } from '../../lib/format';
import type { Job } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { haversineM, routeUrl, severityEdge, useMyPosition } from './shared';

const JobDetail = lazy(() => import('./JobDetail'));
const MarkFixed = lazy(() => import('./MarkFixed'));

export function useJobs(includeDone: boolean) {
  return useQuery({
    queryKey: ['jobs', includeDone],
    queryFn: () => api<{ items: Job[] }>(`/tech/jobs${includeDone ? '?include_done=true' : ''}`),
    refetchInterval: 60_000,
  });
}

function JobList() {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const [params] = useSearchParams();
  const showDone = params.get('done') === '1';
  const q = useJobs(showDone);
  const me = useMyPosition();
  const jobs = q.data?.items ?? [];
  const open = jobs.filter((j) => j.status !== 'fixed');
  const route = open.length
    ? open.reduce(
        (acc, j) => ({ m: acc.m + (acc.at ? haversineM(acc.at, j) : 0), at: { lat: j.lat, lng: j.lng } }),
        { m: 0, at: me as { lat: number; lng: number } | undefined },
      ).m
    : 0;
  const date = new Date().toLocaleDateString(i18n.language === 'sw' ? 'sw-KE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <CitizenShell menu="technician" homeTo="/tech">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-brand-700">{date}</p>
          <h1 className="text-[1.9rem] font-normal leading-tight tracking-tight text-ink-heading">
            {showDone ? t('tech.finishedJobs') : t('tech.title')}
          </h1>
        </div>
        {q.data && (
          <span className="mb-1 rounded-full bg-brand-50 px-2.5 py-1 text-sm font-semibold text-brand-700">
            {t('tech.jobCount', { count: showDone ? jobs.length : open.length })}
          </span>
        )}
      </div>

      {!showDone && open.length > 0 && (
        <a href={routeUrl(open)} target="_blank" rel="noreferrer"
          className="flex min-h-[72px] items-center gap-4 rounded-xl bg-brand-600 px-5 text-white shadow-sm hover:bg-brand-700 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <IconNavigation size={22} />
          <span className="flex flex-1 flex-col">
            <span className="font-semibold">{t('tech.startRoute')}</span>
            <span className="text-sm text-white/90">
              {me ? t('tech.routeSummary', { count: open.length, km: (route / 1000).toFixed(1) }) : t('tech.jobCount', { count: open.length })}
            </span>
          </span>
          <IconChevronDown size={20} className="-rotate-90" />
          <span className="sr-only">{t('tech.opensMaps')}</span>
        </a>
      )}

      {q.isLoading && <ListSkeleton rows={3} label={t('tech.loading')} />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      {q.data && jobs.length === 0 && (
        <EmptyState title={showDone ? t('tech.noneDone') : t('tech.emptyTitle')} body={showDone ? undefined : t('tech.emptyBody')} icon={<IconCheck size={36} />} />
      )}

      <ol className="flex flex-col gap-3">
        {jobs.map((j, i) => {
          const away = me ? haversineM(me, j) : null;
          return (
            <li key={j.id} className="relative overflow-hidden rounded-xl border border-surface-line bg-surface">
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: severityEdge(j.severity) }} aria-hidden="true" />
              <Link to={`/tech/jobs/${j.id}`}
                className="block px-5 pb-3 pt-4 hover:bg-[#f7f9fb] focus-visible:outline focus-visible:outline-3 focus-visible:-outline-offset-2 focus-visible:outline-focus">
                <span className="flex items-center justify-between gap-2">
                  <SeverityBadge severity={j.severity} plain />
                  {j.status === 'fixed' ? (
                    <StatusBadge status="fixed" size="sm" />
                  ) : (
                    <span className="rounded-full bg-[#fdf1d8] px-2 py-0.5 text-xs font-bold text-[#7a4704]">{t('tech.rank', { n: i + 1 })}</span>
                  )}
                </span>
                <span className="mt-2 block text-xl font-normal text-ink-heading">{leakName(t, j.leak_type, j.is_main)}</span>
                <span className="mt-1 flex items-start gap-1.5 text-[15px] text-ink-muted">
                  <IconPin size={16} className="mt-0.5 shrink-0" />
                  {[j.address_text.split(',').slice(0, 2).join(','), j.zone_name].filter(Boolean)[0] || '—'}
                </span>
                {j.status === 'in_progress' && <span className="mt-2 inline-block"><StatusBadge status="in_progress" size="sm" /></span>}
              </Link>
              <div className="mx-5 flex items-center justify-between gap-3 border-t border-surface-line py-3">
                <span className="text-sm text-ink-muted">
                  {away != null ? (
                    <><span className="font-semibold text-ink">{distance(away)}</span> {t('tech.away')}</>
                  ) : (
                    <span>{j.reference_code}</span>
                  )}
                </span>
                <a href={directionsUrl(j.lat, j.lng)} target="_blank" rel="noreferrer"
                  className={`${buttonClass('outline', 'md')} min-h-[44px] text-sm`}>
                  <IconNavigation size={18} /> {t('tech.directions')}
                  <span className="sr-only">{t('tech.directionsTo', { place: leakName(t, j.leak_type, j.is_main) })}</span>
                </a>
              </div>
            </li>
          );
        })}
      </ol>
      {!showDone && jobs.length > 0 && (
        <Link to="/tech?done=1" className="self-center rounded px-2 py-3 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
          {t('tech.showFinished')}
        </Link>
      )}
    </CitizenShell>
  );
}

export default function TechRoutes() {
  return (
    <Routes>
      <Route index element={<JobList />} />
      <Route path="jobs/:id" element={<JobDetail />} />
      <Route path="jobs/:id/fix" element={<MarkFixed />} />
    </Routes>
  );
}
