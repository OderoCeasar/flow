import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route, Routes, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { IconKeyboard } from '../../components/ui/Icons';
import { EmptyState, ErrorState, ListSkeleton, Skeleton } from '../../components/ui/States';
import { api } from '../../lib/api';
import type { Page, Report, ReportDetail, Zone } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { StaffShell } from '../staff/StaffShell';
import { AssignDialog } from './AssignDialog';
import { DetailPanel } from './DetailPanel';
import { Filters, toQuery } from './Filters';
import { ReportTable } from './ReportTable';
import Stats from './Stats';
import { useReportActions } from './useReportActions';
import { useQueryClient } from '@tanstack/react-query';

const ReportsMap = lazy(() => import('../../components/map/ReportsMap'));

function isTyping(el: Element | null) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable || !!el.closest('dialog[open]');
}

function ReportsView() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [bbox, setBbox] = useState<[number, number, number, number]>();
  const [assignFor, setAssignFor] = useState<Report>();
  const [help, setHelp] = useState(false);
  const actions = useReportActions();
  const selectedId = params.get('selected') ?? undefined;
  const query = toQuery(params, bbox);

  const list = useQuery({
    queryKey: ['reports', query],
    queryFn: () => api<Page<Report>>(`/utility/reports?${query}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const zones = useQuery({ queryKey: ['zones'], queryFn: () => api<{ items: Zone[] }>('/utility/zones'), staleTime: 3600_000 });
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  const select = useCallback(
    (id?: string) =>
      setParams(
        (p) => {
          if (id) p.set('selected', id);
          else p.delete('selected');
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  // Keyboard shortcuts: J/K move, A assign, V verify, M merge suggestion, ? help.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(document.activeElement)) return;
      const idx = items.findIndex((r) => r.id === selectedId);
      const current = items[idx];
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
          select(undefined);
          break;
        case '?':
          setHelp(true);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, selectedId, select, actions.update, actions.merge, qc, t]);

  const page = list.data?.page ?? 1;
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.page_size)) : 1;
  const goPage = (n: number) => setParams((p) => { p.set('page', String(n)); return p; });

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col">
      <Filters params={params} setParams={setParams} zones={zones.data?.items ?? []} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,34%)]">
        <section aria-label={t('dashboard.listLabel')} className="flex min-h-0 flex-col border-r border-surface-line bg-surface">
          <div className="flex items-center justify-between gap-2 border-b border-surface-line px-4 py-2 text-sm text-ink-muted">
            <span aria-live="polite">{list.data ? t('dashboard.showing', { count: items.length, total: list.data.total }) : ''}</span>
            <Button size="sm" variant="ghost" icon={<IconKeyboard size={18} />} onClick={() => setHelp(true)}>{t('dashboard.shortcuts')}</Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {list.isLoading ? (
              <div className="p-4"><ListSkeleton rows={8} label={t('dashboard.loading')} /></div>
            ) : list.isError ? (
              <div className="p-4"><ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} /></div>
            ) : items.length === 0 ? (
              <div className="p-4">
                <EmptyState title={t('dashboard.emptyTitle')} body={params.toString() ? t('dashboard.emptyFiltered') : t('dashboard.empty')}
                  action={params.toString() ? <Button variant="secondary" onClick={() => setParams(new URLSearchParams())}>{t('dashboard.clear')}</Button> : undefined} />
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
        </section>
        <aside className="flex min-h-0 flex-col" aria-label={t('dashboard.sideLabel')}>
          <div className={selectedId ? 'h-[38%] min-h-[200px]' : 'flex-1'}>
            <Suspense fallback={<Skeleton className="h-full w-full" />}>
              <ReportsMap reports={items} selectedId={selectedId} onSelect={select} onBounds={setBbox} />
            </Suspense>
          </div>
          {selectedId && (
            <div className="min-h-0 flex-1 overflow-auto border-t border-surface-line bg-surface">
              <DetailPanel key={selectedId} id={selectedId} onClose={() => select(undefined)}
                onAssign={() => setAssignFor(items.find((r) => r.id === selectedId) ?? qc.getQueryData<ReportDetail>(['report', selectedId])?.report)} />
            </div>
          )}
        </aside>
      </div>
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
    </div>
  );
}

export default function Dashboard() {
  return (
    <StaffShell>
      <Routes>
        <Route index element={<ReportsView />} />
        <Route path="stats" element={<Stats />} />
      </Routes>
    </StaffShell>
  );
}
