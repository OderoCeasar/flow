import { useTranslation } from 'react-i18next';
import type { PriorityItem } from '../../lib/types';

// Explains a score line by line ("Burst main +10, near hospital +12 ...").
// Labels are rebuilt from key + params so they follow the chosen language.
export function useBreakdownLabel() {
  const { t, i18n } = useTranslation();
  return (item: PriorityItem) => {
    const p = item.params ?? {};
    const name = item.key === 'age' && Number(p.hours) >= 48 ? 'ageDays' : item.key;
    const key = `priority.reasons.${name}`;
    if (!i18n.exists(key, { count: 1 })) return item.label;
    return t(key, {
      ...p,
      severity: p.severity ? t(`severity.${p.severity}`) : undefined,
      kind: p.kind ? t(`siteKind.${p.kind}`) : undefined,
      count: p.count as number,
      days: p.hours != null ? Math.floor(Number(p.hours) / 24) : undefined,
      hours: p.hours,
      litres: p.litres_per_day != null ? Number(p.litres_per_day).toLocaleString() : undefined,
    });
  };
}

export function PriorityBreakdown({ items, score }: { items: PriorityItem[]; score: number }) {
  const { t } = useTranslation();
  const label = useBreakdownLabel();
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{t('priority.breakdownCaption', { score })}</caption>
      <tbody>
        {items.map((it, i) => (
          <tr key={i} className="border-b border-surface-line last:border-0">
            <td className="py-1.5 pr-2">{label(it)}</td>
            <td className={`py-1.5 text-right font-semibold tabular-nums ${it.points < 0 ? 'text-danger-700' : 'text-ink'}`}>
              {it.points > 0 ? `+${it.points}` : it.points}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" className="pt-2 text-left">{t('priority.total')}</th>
          <td className="pt-2 text-right text-lg font-bold tabular-nums">{score}</td>
        </tr>
      </tfoot>
    </table>
  );
}
