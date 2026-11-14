import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route, Routes, useSearchParams } from 'react-router-dom';
import { leakName, StatusBadge } from '../../components/ui/Badges';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { IconClose, IconSearch } from '../../components/ui/Icons';
import { EmptyState, ErrorState, ListSkeleton, Skeleton } from '../../components/ui/States';
import { api } from '../../lib/api';
import { initials } from '../../lib/format';
import type { Crew, Page, Report, ReportDetail, Zone } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { AssignDialog } from './AssignDialog';
import { DetailDrawer } from './DetailDrawer';
import { DispatcherShell, SHORTCUTS_EVENT } from './DispatcherShell';
import { Filters, toQuery } from './Filters';
import { Kpis } from './Kpis';
import { ReportTable } from './ReportTable';
import Stats from './Stats';
import { useReportActions } from './useReportActions';

const ReportsMap = lazy(() => import('../../components/map/ReportsMap'));

function isTyping(el: Element | null) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable || !!el.closest('dialog[open]');
}

function useZones() {
  return useQuery({ queryKey: ['zones'], queryFn: () => api<{ items: Zone[] }>('/utility/zones'), staleTime: 3600_000 });
}

// Selection, the drawer, the assign dialog and keyboard shortcuts, shared by
// the Reports, Map and Crews pages.
function useWorkspace(items: Report[]) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [assignFor, setAssignFor] = useState<Report>();
  const [help, setHelp] = useState(false);
  const actions = useReportActions();
  const selectedId = params.get('selected') ?? undefined;
  const lastRow = useRef<string>();

  const select = useCallback(
    (id?: string) => {
      if (id) lastRow.current = id;
      setParams(
        (p) => {
          if (id) p.set('selected', id);
          else p.delete('selected');
          return p;
        },
        { replace: true },
      );
      if (!id && lastRow.current) {
        // Put focus back on the row the drawer was opened from.
        setTimeout(() => document.querySelector<HTMLElement>(`[data-report-id="${lastRow.current}"]`)?.focus(), 0);
      }
    },
    [setParams],
  );

  useEffect(() => {
    const show = () => setHelp(true);
    window.addEventListener(SHORTCUTS_EVENT, show);
    return () => window.removeEventListener(SHORTCUTS_EVENT, show);
  }, []);

  // J/K move, A assign, V verify, M merge suggestion, Esc close, ? help.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(document.activeElement)) return;
      const idx = items.findIndex((r) => r.id === selectedId);
      const current = items[idx] ?? qc.getQueryData<ReportDetail>(['report', selectedId])?.report;
      switch (e.key.toLowerCase()) {
        case 'j':
        case 'k': {
          e.preventDefault();
          const next = e.key.toLowerCase() === 'j' ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
          const r = items[next];
          if (r) {
            select(r.id);
            document.querySelector<HTMLElement>(`[data-report-id="${r.id}"]`)?.focus();
          }
          break;
        }
        case 'a':
          if (current && current.status !== 'fixed' && current.status !== 'invalid') {
            e.preventDefault();
            setAssignFor(current);
          }
          break;
        case 'v':
          if (current?.status === 'received') {
            e.preventDefault();
            actions.update.mutate({ id: current.id, body: { status: 'verified' }, message: t('actions.verified'), undo: { status: 'received', note: t('actions.undoNote') } });
          }
          break;
        case 'm': {
          const detail = current && qc.getQueryData<ReportDetail>(['report', current.id]);
          if (detail?.suggestion && current?.cluster_id) {
            e.preventDefault();
            actions.merge.mutate({ target: detail.suggestion.cluster_id, source: current.cluster_id });
          }
          break;
        }
        case 'escape':
          if (selectedId) select(undefined);
          break;
        case '?':
          setHelp(true);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, selectedId, select, actions.update, actions.merge, qc, t]);

  const overlays = (
    <>
      {selectedId && (
        <DetailDrawer
          key={selectedId}
          id={selectedId}
          onClose={() => select(undefined)}
          onAssign={() => setAssignFor(items.find((r) => r.id === selectedId) ?? qc.getQueryData<ReportDetail>(['report', selectedId])?.report)}
        />
      )}
      <AssignDialog report={assignFor} onClose={() => setAssignFor(undefined)} />
      <Dialog open={help} onClose={() => setHelp(false)} title={t('dashboard.shortcuts')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {[['J / K', 'next'], ['Enter', 'open'], ['A', 'assign'], ['V', 'verify'], ['M', 'merge'], ['Esc', 'close'], ['?', 'help']].map(([k, v]) => (
            <div key={k} className="contents">
              <dt><kbd className="rounded border border-surface-line bg-surface-muted px-2 py-0.5 font-mono text-sm">{k}</kbd></dt>
              <dd>{t(`dashboard.keys.${v}`)}</dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </>
  );
  return { params, setParams, selectedId, select, overlays };
}

function SearchBox({ params, setParams }: { params: URLSearchParams; setParams: ReturnType<typeof useSearchParams>[1] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!!params.get('q'));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  const set = (v: string) =>
    setParams((p) => {
      if (v) p.set('q', v);
      else p.delete('q');
      p.delete('page');
      return p;
    }, { replace: true });
  if (!open)
    return (
      <button type="button" aria-label={t('dashboard.search')} onClick={() => setOpen(true)}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-surface-line bg-surface text-ink hover:bg-surface-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
        <IconSearch size={20} />
      </button>
    );
  return (
    <div role="search" className="relative w-full sm:w-72">
      <label htmlFor="report-search" className="sr-only">{t('dashboard.search')}</label>
      <IconSearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input id="report-search" ref={input} defaultValue={params.get('q') ?? ''} placeholder={t('dashboard.searchPlaceholder')}
        onChange={(e) => set(e.target.value.trim())}
        onKeyDown={(e) => e.key === 'Escape' && (set(''), setOpen(false))}
        className="h-11 w-full rounded-xl border border-surface-line bg-surface pl-9 pr-10 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200" />
      <button type="button" aria-label={t('dashboard.clearSearch')} onClick={() => { set(''); setOpen(false); }}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
        <IconClose size={16} />
      </button>
    </div>
  );
}

function ReportsView() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [searchParams] = useSearchParams();
  const [bbox, setBbox] = useState<[number, number, number, number]>();
  const query = toQuery(searchParams, bbox);
  const list = useQuery({
    queryKey: ['reports', query],
    queryFn: () => api<Page<Report>>(`/utility/reports?${query}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const zones = useZones();
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const { params, setParams, selectedId, select, overlays } = useWorkspace(items);
  const status = params.get('status') ?? 'open';
  const page = list.data?.page ?? 1;
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.page_size)) : 1;
  const goPage = (n: number) => setParams((p) => { p.set('page', String(n)); return p; });
  const filtered = [...params.keys()].some((k) => !['selected', 'page'].includes(k));

  return (
    <DispatcherShell actions={<SearchBox params={params} setParams={setParams} />}>
      <Kpis />
      <section aria-labelledby="list-title"
        className="mt-5 flex min-h-[540px] flex-1 flex-col overflow-hidden rounded-xl border border-surface-line bg-surface xl:grid xl:h-[calc(100dvh-268px)] xl:grid-cols-[minmax(0,1fr)_minmax(360px,32%)]">
        <div className="flex min-h-0 flex-col">
          <div className="flex flex-col gap-4 px-5 pb-4 pt-5">
            <div>
              <h2 id="list-title" className="text-xl font-normal text-ink-heading">
                {status === 'open' ? t('dashboard.openReports') : status === 'review' ? t('dashboard.statusReview') : status === 'all' ? t('dashboard.allReports') : t(`status.${status}`)}
              </h2>
              <p className="text-sm text-ink-muted" aria-live="polite">{list.data ? t('dashboard.reportsCount', { count: list.data.total }) : ' '}</p>
            </div>
            <Filters params={params} setParams={setParams} zones={zones.data?.items ?? []} total={list.data?.total} />
          </div>
          <div className="min-h-0 flex-1 overflow-auto border-t border-surface-line">
            {list.isLoading ? (
              <div className="p-4"><ListSkeleton rows={8} label={t('dashboard.loading')} /></div>
            ) : list.isError ? (
              <div className="p-4"><ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} /></div>
            ) : items.length === 0 ? (
              <div className="p-4">
                <EmptyState title={t('dashboard.emptyTitle')} body={filtered ? t('dashboard.emptyFiltered') : t('dashboard.empty')}
                  action={filtered ? <Button variant="outline" onClick={() => setParams(new URLSearchParams())}>{t('dashboard.clear')}</Button> : undefined} />
              </div>
            ) : (
              <ReportTable reports={items} selectedId={selectedId} onSelect={select} />
            )}
          </div>
          {pages > 1 && (
            <nav aria-label={t('dashboard.pagination')} className="flex items-center justify-between border-t border-surface-line px-4 py-2 text-sm">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => goPage(page - 1)}>{t('dashboard.prev')}</Button>
              <span>{t('dashboard.pageOf', { page, pages })}</span>
              <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => goPage(page + 1)}>{t('dashboard.next')}</Button>
            </nav>
          )}
        </div>
        <div className="hidden min-h-0 border-l border-surface-line xl:block">
          <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
            <ReportsMap reports={items} selectedId={selectedId} onSelect={select} onBounds={setBbox} zones={zones.data?.items} />
          </Suspense>
        </div>
      </section>
      {overlays}
    </DispatcherShell>
  );
}

function MapView() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const query = toQuery(searchParams).replace('page_size=50', 'page_size=200');
  const list = useQuery({ queryKey: ['reports', query], queryFn: () => api<Page<Report>>(`/utility/reports?${query}`), refetchInterval: 60_000 });
  const zones = useZones();
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const { selectedId, select, overlays } = useWorkspace(items);
  return (
    <DispatcherShell title={t('nav.map')}>
      <p className="mb-3 text-sm text-ink-muted" aria-live="polite">{list.data ? t('dashboard.mapCount', { count: items.length }) : ' '}</p>
      <div className="h-[calc(100dvh-210px)] min-h-[420px] overflow-hidden rounded-xl border border-surface-line">
        <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
          <ReportsMap reports={items} selectedId={selectedId} onSelect={select} zones={zones.data?.items} />
        </Suspense>
      </div>
      {overlays}
    </DispatcherShell>
  );
}

function CrewsView() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const q = useQuery({ queryKey: ['crews'], queryFn: () => api<{ items: Crew[] }>('/utility/crews'), refetchInterval: 60_000 });
  const jobs = useMemo(() => (q.data?.items ?? []).flatMap((c) => c.jobs), [q.data]);
  const { select, overlays } = useWorkspace(jobs);
  return (
    <DispatcherShell title={t('nav.crews')}>
      {q.isLoading && <ListSkeleton rows={3} />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      {q.data && q.data.items.length === 0 && <EmptyState title={t('crews.empty')} body={t('crews.emptyBody')} />}
      <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {q.data?.items.map(({ technician: tech, jobs }) => (
          <li key={tech.id} className="flex flex-col rounded-xl border border-surface-line bg-surface">
            <div className="flex items-center gap-3 border-b border-surface-line p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#d5efe9] text-sm font-bold text-accent-800" aria-hidden="true">
                {initials(tech.name)}
              </span>
              <div className="flex-1">
                <h2 className="font-semibold text-ink">{tech.name}</h2>
                <p className="text-sm text-ink-muted">
                  {t('assign.openJobs', { count: tech.open_jobs })} · {t('crews.fixedToday', { count: tech.fixed_today })}
                </p>
              </div>
            </div>
            {jobs.length === 0 ? (
              <p className="p-4 text-sm text-ink-muted">{t('crews.free')}</p>
            ) : (
              <ul className="divide-y divide-surface-line">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <button type="button" data-report-id={j.id} onClick={() => select(j.id)}
                      className="flex min-h-touch w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#f7f9fb] focus-visible:outline focus-visible:outline-3 focus-visible:-outline-offset-2 focus-visible:outline-focus">
                      <span className="w-7 font-bold tabular-nums">{j.priority_score}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium text-ink">{leakName(t, j.leak_type, j.is_main)}</span>
                        <span className="truncate text-xs text-ink-subtle">{j.reference_code} · {j.address_text.split(',')[0] || j.zone_name}</span>
                      </span>
                      <StatusBadge status={j.status} size="sm" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {overlays}
    </DispatcherShell>
  );
}

function StatsView() {
  const { t } = useTranslation();
  return (
    <DispatcherShell title={t('nav.stats')}>
      <Stats />
    </DispatcherShell>
  );
}

export default function Dashboard() {
  return (
    <Routes>
      <Route index element={<ReportsView />} />
      <Route path="map" element={<MapView />} />
      <Route path="crews" element={<CrewsView />} />
      <Route path="stats" element={<StatsView />} />
    </Routes>
  );
}
