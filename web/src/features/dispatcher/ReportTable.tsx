import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { leakName, SeverityBadge, StatusBadge } from '../../components/ui/Badges';
import { IconUsers, IconWarning } from '../../components/ui/Icons';
import { ageShort, shortName } from '../../lib/format';
import type { Report } from '../../lib/types';

// Priority number with a short bar; the number carries the meaning.
function PriorityCell({ score, overridden }: { score: number; overridden: boolean }) {
  const { t } = useTranslation();
  const tone = score >= 80 ? '#c2410c' : score >= 60 ? '#ea7a2c' : score >= 40 ? '#e8a23a' : '#94a3b8';
  return (
    <span className="flex items-center gap-2">
      <span className="sr-only">{t('priority.scoreLabel', { score }) + (overridden ? `, ${t('priority.overridden')}` : '')}</span>
      <span className="w-7 text-[15px] font-bold tabular-nums text-ink" aria-hidden="true">
        {score}
        {overridden && '*'}
      </span>
      <span className="h-1.5 w-9 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
        <span className="block h-full rounded-full" style={{ width: `${score}%`, background: tone }} />
      </span>
    </span>
  );
}

function ReviewTag() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-warning-50 px-1 text-[11px] font-semibold text-warning-800">
      <IconWarning size={11} /> {t('dashboard.review')}
    </span>
  );
}

function usePhone() {
  const query = '(max-width: 639px)';
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

// On phones a table doesn't fit, so each report becomes a compact card with
// the same selection and keyboard behaviour.
function ReportCards({ reports, selectedId, onSelect }: { reports: Report[]; selectedId?: string; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <ul className="divide-y divide-surface-line" aria-label={t('dashboard.tableCaption')}>
      {reports.map((r) => (
        <li key={r.id}>
          <button type="button" data-report-id={r.id} aria-pressed={r.id === selectedId} onClick={() => onSelect(r.id)}
            className={`flex w-full items-start gap-3 px-4 py-3 text-left focus-visible:outline focus-visible:outline-3 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
              r.id === selectedId ? 'bg-brand-50/70 shadow-[inset_3px_0_0_theme(colors.brand.600)]' : 'bg-surface'}`}>
            <PriorityCell score={r.priority_score} overridden={r.priority_override != null} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-semibold text-ink">{leakName(t, r.leak_type, r.is_main)}</span>
              <span className="truncate text-xs text-ink-subtle">
                {r.reference_code} · {r.address_text.split(',')[0] || r.zone_name} · {ageShort(r.created_at)}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={r.severity} plain />
                <StatusBadge status={r.status} size="sm" />
                {r.needs_review && <ReviewTag />}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Dense, scannable rows: priority and severity lead; secondary details are
// smaller and lighter. The header stays put while the list scrolls.
export function ReportTable({ reports, selectedId, onSelect }: { reports: Report[]; selectedId?: string; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const phone = usePhone();
  const selectedRow = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);
  if (phone) return <ReportCards reports={reports} selectedId={selectedId} onSelect={onSelect} />;
  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-surface-line bg-[#f7f9fb] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-muted';
  const td = 'border-b border-surface-line px-3 py-3.5 align-middle';
  return (
    <table className="w-full border-separate border-spacing-0 text-sm">
      <caption className="sr-only">{t('dashboard.tableCaption')}</caption>
      <thead>
        <tr>
          <th scope="col" className={`${th} pl-4`}>{t('dashboard.columns.priority')}</th>
          <th scope="col" className={th}>{t('dashboard.columns.severity')}</th>
          <th scope="col" className={th}>{t('dashboard.columns.leakType')}</th>
          <th scope="col" className={`${th} hidden lg:table-cell`}>{t('dashboard.columns.location')}</th>
          <th scope="col" className={`${th} hidden sm:table-cell`}>{t('dashboard.columns.reports')}</th>
          <th scope="col" className={`${th} hidden lg:table-cell`}>{t('dashboard.columns.age')}</th>
          <th scope="col" className={th}>{t('dashboard.columns.status')}</th>
          <th scope="col" className={`${th} hidden xl:table-cell`}>{t('dashboard.columns.assigned')}</th>
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
                selected ? 'bg-brand-50/70 shadow-[inset_3px_0_0_theme(colors.brand.600)]' : 'bg-surface hover:bg-[#f7f9fb]'
              }`}
            >
              <td className={`${td} pl-4`}>
                <PriorityCell score={r.priority_score} overridden={r.priority_override != null} />
              </td>
              <td className={td}>
                <SeverityBadge severity={r.severity} plain />
              </td>
              <td className={td}>
                <span className="flex flex-col">
                  <span className="whitespace-nowrap font-semibold text-ink">{leakName(t, r.leak_type, r.is_main)}</span>
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-subtle">
                    {r.reference_code}
                    {r.needs_review && <ReviewTag />}
                  </span>
                </span>
              </td>
              <td className={`${td} hidden max-w-[14rem] text-ink-muted lg:table-cell`}>
                <span className="line-clamp-2">{[r.address_text.split(',')[0], r.zone_name].filter(Boolean).join(', ') || '—'}</span>
              </td>
              <td className={`${td} hidden tabular-nums text-ink-muted sm:table-cell`}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="sr-only">{t('dashboard.reportCount', { count: r.duplicate_count + 1 })}</span>
                  <IconUsers size={16} aria-hidden="true" />
                  <span aria-hidden="true">{r.duplicate_count + 1}</span>
                  {r.suggested_cluster_id && <span className="text-xs font-semibold text-warning-800" title={t('dashboard.possibleDuplicate')}>?</span>}
                </span>
              </td>
              <td className={`${td} hidden whitespace-nowrap tabular-nums text-ink-muted lg:table-cell`}>{ageShort(r.created_at)}</td>
              <td className={td}>
                <StatusBadge status={r.status} size="sm" />
              </td>
              <td className={`${td} hidden whitespace-nowrap text-ink-muted xl:table-cell`}>
                {r.assignee_name ? shortName(r.assignee_name) : t('dashboard.unassigned')}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
