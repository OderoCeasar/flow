import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { IconArrowDown, IconArrowUp } from '../../components/ui/Icons';
import { Skeleton } from '../../components/ui/States';
import { api } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import type { Stats } from '../../lib/types';

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('/utility/stats'), refetchInterval: 120_000 });
}

// The coloured top edge only tells the cards apart; every value is in text.
function Card({ label, value, note, edge }: { label: string; value: string; note?: React.ReactNode; edge: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-surface-line border-t-[3px] bg-surface px-5 py-4" style={{ borderTopColor: edge }}>
      <span className="text-sm text-ink-muted">{label}</span>
      <div className="flex items-end justify-between gap-2">
        <span className="text-[1.75rem] font-semibold leading-none tabular-nums text-ink">{value}</span>
        {note && <span className="flex items-center gap-1 text-xs text-ink-muted">{note}</span>}
      </div>
    </div>
  );
}

export function Kpis() {
  const { t, i18n } = useTranslation();
  const q = useStats();
  if (q.isLoading || !q.data)
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-label={t('app.loading')}>
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}
      </div>
    );
  const s = q.data;
  const n = (v: number) => formatNumber(v, i18n.language);
  const weekChange = s.fixed_previous_week ? Math.round(((s.fixed_this_week - s.fixed_previous_week) / s.fixed_previous_week) * 100) : null;
  const fixDelta = s.avg_hours_to_fix_prev_30d && s.avg_hours_to_fix_30d ? Math.round(s.avg_hours_to_fix_30d - s.avg_hours_to_fix_prev_30d) : null;
  return (
    <section aria-label={t('kpi.label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card label={t('kpi.open')} value={n(s.open_leaks)} edge="#3b82c4" note={t('kpi.today', { count: s.reports_today })} />
      <Card label={t('kpi.critical')} value={n(s.critical_open)} edge="#dc2626" note={s.critical_open ? t('kpi.needsAttention') : t('kpi.allClear')} />
      <Card
        label={t('kpi.fixedWeek')}
        value={n(s.fixed_this_week)}
        edge="#16a34a"
        note={
          weekChange != null && (
            <>
              {weekChange >= 0 ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />}
              <span>{t('kpi.vsLastWeek', { pct: Math.abs(weekChange) })}</span>
            </>
          )
        }
      />
      <Card
        label={t('kpi.avgFix')}
        value={s.fixed_last_90_days ? `${Math.round(s.avg_hours_to_fix)}h` : '—'}
        edge="#0d8a7d"
        note={
          fixDelta != null && fixDelta !== 0 && (
            <>
              {fixDelta < 0 ? <IconArrowDown size={12} /> : <IconArrowUp size={12} />}
              <span>{t(fixDelta < 0 ? 'kpi.fasterThisMonth' : 'kpi.slowerThisMonth', { hours: Math.abs(fixDelta) })}</span>
            </>
          )
        }
      />
    </section>
  );
}
