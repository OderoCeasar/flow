import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SetURLSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Select, TextInput } from '../../components/ui/Field';
import { IconChevronDown, IconFilter, IconSearch } from '../../components/ui/Icons';
import { LEAK_TYPES, SEVERITIES, STATUSES, type Zone } from '../../lib/types';

export const OPEN_STATUSES = 'received,verified,scheduled,in_progress';

// The four filters dispatchers use most stay visible; the rest sit behind "More filters".
export function Filters({ params, setParams, zones }: { params: URLSearchParams; setParams: SetURLSearchParams; zones: Zone[] }) {
  const { t } = useTranslation();
  const [more, setMore] = useState(() => ['leak_type', 'zone', 'from', 'to', 'in_view'].some((k) => params.get(k)));
  const set = (key: string, value: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        p.delete('page');
        return p;
      },
      { replace: true },
    );
  const status = params.get('status') ?? 'open';
  const label = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted';
  const ctl = 'min-h-[40px] py-1 text-sm';
  const active = [...params.keys()].filter((k) => !['selected', 'page', 'sort'].includes(k)).length > 0;

  return (
    <form role="search" className="flex flex-col gap-2 border-b border-surface-line bg-surface px-4 py-3" onSubmit={(e) => e.preventDefault()}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="f-q" className={label}>{t('dashboard.search')}</label>
          <div className="relative">
            <IconSearch size={18} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <TextInput id="f-q" className={`${ctl} pl-9`} placeholder={t('dashboard.searchPlaceholder')} defaultValue={params.get('q') ?? ''}
              onChange={(e) => set('q', e.target.value.trim())} />
          </div>
        </div>
        <div>
          <label htmlFor="f-status" className={label}>{t('dashboard.status')}</label>
          <Select id="f-status" className={ctl} value={status} onChange={(e) => set('status', e.target.value === 'open' ? '' : e.target.value)}>
            <option value="open">{t('dashboard.statusOpen')}</option>
            <option value="review">{t('dashboard.statusReview')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            <option value="all">{t('dashboard.statusAll')}</option>
          </Select>
        </div>
        <div>
          <label htmlFor="f-sev" className={label}>{t('dashboard.severity')}</label>
          <Select id="f-sev" className={ctl} value={params.get('severity') ?? ''} onChange={(e) => set('severity', e.target.value)}>
            <option value="">{t('dashboard.any')}</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{t(`severity.${s}`)}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="f-sort" className={label}>{t('dashboard.sort')}</label>
          <Select id="f-sort" className={ctl} value={params.get('sort') ?? 'priority'} onChange={(e) => set('sort', e.target.value === 'priority' ? '' : e.target.value)}>
            {['priority', 'severity', 'newest', 'oldest'].map((s) => <option key={s} value={s}>{t(`dashboard.sorts.${s}`)}</option>)}
          </Select>
        </div>
        <Button size="sm" variant="ghost" aria-expanded={more} aria-controls="more-filters" onClick={() => setMore((m) => !m)}
          icon={<IconFilter size={16} />}>
          {t('dashboard.moreFilters')}
          <IconChevronDown size={16} className={more ? 'rotate-180' : ''} />
        </Button>
        {active && (
          <Button size="sm" variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            {t('dashboard.clear')}
          </Button>
        )}
      </div>
      {more && (
        <div id="more-filters" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="f-type" className={label}>{t('dashboard.leakType')}</label>
            <Select id="f-type" className={ctl} value={params.get('leak_type') ?? ''} onChange={(e) => set('leak_type', e.target.value)}>
              <option value="">{t('dashboard.any')}</option>
              {LEAK_TYPES.map((s) => <option key={s} value={s}>{t(`leakType.${s}`)}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="f-zone" className={label}>{t('dashboard.area')}</label>
            <Select id="f-zone" className={ctl} value={params.get('zone') ?? ''} onChange={(e) => set('zone', e.target.value)}>
              <option value="">{t('dashboard.anyArea')}</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="f-from" className={label}>{t('dashboard.from')}</label>
            <TextInput id="f-from" type="date" className={ctl} value={params.get('from') ?? ''} onChange={(e) => set('from', e.target.value)} />
          </div>
          <div>
            <label htmlFor="f-to" className={label}>{t('dashboard.to')}</label>
            <TextInput id="f-to" type="date" className={ctl} value={params.get('to') ?? ''} onChange={(e) => set('to', e.target.value)} />
          </div>
          <label className="flex min-h-[40px] items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={params.get('in_view') === '1'}
              onChange={(e) => set('in_view', e.target.checked ? '1' : '')} />
            {t('dashboard.inView')}
          </label>
        </div>
      )}
    </form>
  );
}

// toQuery turns the URL filters into the API query string.
export function toQuery(params: URLSearchParams, bbox?: [number, number, number, number]) {
  const q = new URLSearchParams();
  const status = params.get('status') ?? 'open';
  if (status === 'open') q.set('status', OPEN_STATUSES);
  // Any status: a Fixed report lands here when its reporter says it isn't fixed.
  else if (status === 'review') q.set('needs_review', 'true');
  else if (status !== 'all') q.set('status', status);
  for (const k of ['severity', 'leak_type', 'zone', 'from', 'to', 'q', 'sort', 'page']) {
    const v = params.get(k);
    if (v) q.set(k, v);
  }
  if (params.get('in_view') === '1' && bbox) q.set('bbox', bbox.map((n) => n.toFixed(5)).join(','));
  q.set('page_size', '50');
  return q.toString();
}
