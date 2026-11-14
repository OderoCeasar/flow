import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LeakTypeLabel, PriorityScore, SeverityBadge, StatusBadge } from '../../components/ui/Badges';
import { IconWarning } from '../../components/ui/Icons';
import { timeAgo } from '../../lib/format';
import type { Report } from '../../lib/types';

// Dense, scannable table: priority and severity lead each row; secondary
// details are smaller and lighter. Header stays put while scrolling.
export function ReportTable({ reports, selectedId, onSelect }: { reports: Report[]; selectedId?: string; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const selectedRow = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);
  const th = 'sticky top-0 z-10 bg-surface-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted';
  return (
    <table className="w-full border-separate border-spacing-0 text-sm">
      <caption className="sr-only">{t('dashboard.tableCaption')}</caption>
      <thead>
        <tr>
          <th scope="col" className={`${th} w-16 text-center`}>{t('dashboard.columns.priority')}</th>
          <th scope="col" className={th}>{t('dashboard.columns.severity')}</th>
          <th scope="col" className={th}>{t('dashboard.columns.report')}</th>
          <th scope="col" className={`${th} hidden xl:table-cell`}>{t('dashboard.columns.location')}</th>
          <th scope="col" className={`${th} text-right`}>{t('dashboard.columns.reports')}</th>
          <th scope="col" className={th}>{t('dashboard.columns.status')}</th>
          <th scope="col" className={`${th} text-right`}>{t('dashboard.columns.age')}</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((r) => {
          const selected = r.id === selectedId;
          return (
            <tr
              key={r.id}
              ref={selected ? selectedRow : undefined}
              tabIndex={0}
              aria-selected={selected}
              data-report-id={r.id}
              onClick={() => onSelect(r.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(r.id);
                }
              }}
              className={`cursor-pointer outline-none focus-visible:outline focus-visible:outline-3 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
                selected ? 'bg-brand-50 shadow-[inset_4px_0_0_theme(colors.brand.600)]' : 'bg-surface hover:bg-surface-muted'
              }`}
            >
              <td className="border-b border-surface-line px-3 py-2 text-center">
                <PriorityScore score={r.priority_score} overridden={r.priority_override != null} />
              </td>
              <td className="border-b border-surface-line px-3 py-2">
                <SeverityBadge severity={r.severity} size="sm" />
              </td>
              <td className="border-b border-surface-line px-3 py-2">
                <div className="flex flex-col">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <LeakTypeLabel type={r.leak_type} />
                    {r.is_main && <span className="rounded bg-surface-sunken px-1 text-xs font-semibold">{t('detail.main')}</span>}
                    {r.needs_review && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-warning-50 px-1 text-xs font-semibold text-warning-800">
                        <IconWarning size={12} /> {t('dashboard.review')}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-xs text-ink-subtle">{r.reference_code}</span>
                </div>
              </td>
              <td className="hidden max-w-[16rem] border-b border-surface-line px-3 py-2 text-ink-muted xl:table-cell">
                <span className="line-clamp-1">{r.zone_name}</span>
                <span className="line-clamp-1 text-xs text-ink-subtle">{r.address_text}</span>
              </td>
              <td className="border-b border-surface-line px-3 py-2 text-right tabular-nums">
                {r.duplicate_count + 1}
                {r.suggested_cluster_id && <span className="ml-1 text-xs font-semibold text-warning-800" title={t('dashboard.possibleDuplicate')}>?</span>}
              </td>
              <td className="border-b border-surface-line px-3 py-2">
                <StatusBadge status={r.status} size="sm" />
              </td>
              <td className="whitespace-nowrap border-b border-surface-line px-3 py-2 text-right text-ink-muted">{timeAgo(r.created_at, t)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
