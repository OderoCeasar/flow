import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { api } from '../../lib/api';
import { duration, formatNumber } from '../../lib/format';
import type { Stats as StatsData } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';

// Bar colours checked with the dataviz palette validator (lightness, chroma,
// colour-blind separation and contrast all pass on white).
const OPEN = '#0b5cad';
const CLOSED = '#4f97de';

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface p-4">
      <span className="text-sm font-semibold text-ink-muted">{label}</span>
      <span className="text-3xl font-bold tabular-nums text-ink">{value}</span>
      {sub && <span className="text-sm text-ink-subtle">{sub}</span>}
    </div>
  );
}

export default function Stats() {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const q = useQuery({ queryKey: ['stats'], queryFn: () => api<StatsData>('/utility/stats'), refetchInterval: 120_000 });

  if (q.isLoading)
    return (
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label={t('app.loading')}>
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}
        <Skeleton className="h-72 sm:col-span-2 lg:col-span-4" />
      </div>
    );
  if (q.isError) return <div className="p-4"><ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></div>;
  const s = q.data!;
  const zones = s.per_zone.slice(0, 10);
  const max = Math.max(1, ...zones.map((z) => z.reports));
  const cubic = (litres: number) => formatNumber(Math.round(litres / 1000), i18n.language);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">{t('stats.title')}</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t('stats.open')} value={formatNumber(s.open_leaks, i18n.language)}
          sub={t('stats.openSub', { critical: s.critical_open, review: s.needs_review })} />
        <Tile label={t('stats.avgFix')} value={s.fixed_last_90_days ? duration(s.avg_hours_to_fix, t) : '—'}
          sub={t('stats.avgFixSub', { count: s.fixed_last_90_days })} />
        <Tile label={t('stats.waterLost')} value={`${cubic(s.water_lost_litres_90d)} m³`}
          sub={t('stats.waterLostSub', { rate: cubic(s.water_loss_rate_lpd) })} />
        <Tile label={t('stats.week')} value={formatNumber(s.reports_this_week, i18n.language)}
          sub={t('stats.weekSub', { fixed: s.fixed_this_week })} />
      </div>
      <p className="text-xs text-ink-subtle">{t('stats.estimateNote')}</p>

      <section aria-labelledby="zones-title" className="rounded-lg bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="zones-title" className="font-semibold">{t('stats.perArea')}</h2>
          <div className="flex gap-4 text-sm text-ink-muted" aria-hidden="true">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: OPEN }} />{t('stats.stillOpen')}</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: CLOSED }} />{t('stats.closed')}</span>
          </div>
        </div>
        {zones.length === 0 ? (
          <p className="text-ink-muted">{t('stats.noReports')}</p>
        ) : (
          // A real table, so the numbers are readable without the bars.
          <table className="w-full text-sm">
            <caption className="sr-only">{t('stats.perAreaCaption')}</caption>
            <thead className="sr-only">
              <tr><th scope="col">{t('stats.area')}</th><th scope="col">{t('stats.stillOpen')}</th><th scope="col">{t('stats.total')}</th><th scope="col">{t('stats.bar')}</th></tr>
            </thead>
            <tbody>
              {zones.map((z) => {
                const closed = z.reports - z.open;
                return (
                  <tr key={z.zone_name} className="group" title={t('stats.barTooltip', { area: z.zone_name, open: z.open, total: z.reports })}>
                    <th scope="row" className="w-40 py-1.5 pr-3 text-left font-medium">{z.zone_name}</th>
                    <td className="w-12 py-1.5 pr-2 text-right tabular-nums text-ink">{z.open}</td>
                    <td className="w-12 py-1.5 pr-3 text-right tabular-nums text-ink-muted">{z.reports}</td>
                    <td className="py-1.5" aria-hidden="true">
                      <div className="flex h-4 gap-[2px] group-hover:opacity-90" style={{ width: `${(z.reports / max) * 100}%` }}>
                        {z.open > 0 && <span className="h-full rounded-l-[4px] last:rounded-r-[4px]" style={{ flex: z.open, background: OPEN }} />}
                        {closed > 0 && <span className="h-full first:rounded-l-[4px] rounded-r-[4px]" style={{ flex: closed, background: CLOSED }} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-ink-subtle">{t('stats.perAreaNote')}</p>
      </section>
    </div>
  );
}
