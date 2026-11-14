import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SetURLSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Select, TextInput } from '../../components/ui/Field';
import { IconCheck, IconChevronDown, IconMore } from '../../components/ui/Icons';
import { LEAK_TYPES, SEVERITIES, STATUSES, type Zone } from '../../lib/types';

export const OPEN_STATUSES = 'received,verified,scheduled,in_progress';

const chip =
  'inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-focus';

// A filter chip that opens a small list of choices. One choice per chip keeps
// each decision small (Hick's law); the rest live behind "More filters".
function Chip({ label, value, badge, active, children }: { label: string; value?: string; badge?: number; active: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className={`${chip} ${active ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-surface-line bg-surface text-ink hover:bg-surface-muted'}`}>
        {label}
        {value && <span className="font-semibold">: {value}</span>}
        {badge != null && <span className="rounded-md bg-surface px-1.5 text-xs font-semibold tabular-nums text-brand-800">{badge}</span>}
        <IconChevronDown size={14} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div id={id} className="absolute left-0 top-[calc(100%+4px)] z-[1300] min-w-[220px] rounded-xl border border-surface-line bg-surface p-2 shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick}
      className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-surface-muted focus-visible:outline focus-visible:outline-3 focus-visible:-outline-offset-2 focus-visible:outline-focus">
      <span className="flex-1">{children}</span>
      {selected && <IconCheck size={16} className="text-brand-700" />}
    </button>
  );
}

export function Filters({ params, setParams, zones, total }: { params: URLSearchParams; setParams: SetURLSearchParams; zones: Zone[]; total?: number }) {
  const { t } = useTranslation();
  const [more, setMore] = useState(() => ['leak_type', 'sort', 'in_view'].some((k) => params.get(k)));
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
  const statusLabel =
    status === 'open' ? t('dashboard.statusOpen') : status === 'review' ? t('dashboard.statusReview') : status === 'all' ? t('dashboard.statusAll') : t(`status.${status}`);
  const severity = params.get('severity') ?? '';
  const zone = params.get('zone') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const filtered = ['severity', 'zone', 'from', 'to', 'leak_type', 'q', 'in_view'].some((k) => params.get(k)) || status !== 'open';

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t('dashboard.filters')} className="flex flex-wrap items-center gap-2">
        <Chip label={statusLabel} active badge={total}>
          {(close) => (
            <>
              {(['open', 'review', ...STATUSES, 'all'] as const).map((s) => (
                <Option key={s} selected={status === s} onClick={() => { set('status', s === 'open' ? '' : s); close(); }}>
                  {s === 'open' ? t('dashboard.statusOpen') : s === 'review' ? t('dashboard.statusReview') : s === 'all' ? t('dashboard.statusAll') : t(`status.${s}`)}
                </Option>
              ))}
            </>
          )}
        </Chip>
        <Chip label={t('dashboard.severity')} value={severity ? t(`severity.${severity}`) : undefined} active={!!severity}>
          {(close) => (
            <>
              <Option selected={!severity} onClick={() => { set('severity', ''); close(); }}>{t('dashboard.any')}</Option>
              {SEVERITIES.map((s) => (
                <Option key={s} selected={severity === s} onClick={() => { set('severity', s); close(); }}>{t(`severity.${s}`)}</Option>
              ))}
            </>
          )}
        </Chip>
        <Chip label={t('dashboard.area')} value={zones.find((z) => z.id === zone)?.name} active={!!zone}>
          {(close) => (
            <div className="max-h-72 overflow-auto">
              <Option selected={!zone} onClick={() => { set('zone', ''); close(); }}>{t('dashboard.anyArea')}</Option>
              {zones.map((z) => (
                <Option key={z.id} selected={zone === z.id} onClick={() => { set('zone', z.id); close(); }}>{z.name}</Option>
              ))}
            </div>
          )}
        </Chip>
        <Chip label={t('dashboard.date')} value={from || to ? `${from || '…'} – ${to || '…'}` : undefined} active={!!(from || to)}>
          {() => (
            <div className="flex flex-col gap-2 p-1">
              <label className="text-xs font-semibold text-ink-muted" htmlFor="f-from">{t('dashboard.from')}</label>
              <TextInput id="f-from" type="date" className="min-h-[40px] py-1 text-sm" value={from} onChange={(e) => set('from', e.target.value)} />
              <label className="text-xs font-semibold text-ink-muted" htmlFor="f-to">{t('dashboard.to')}</label>
              <TextInput id="f-to" type="date" className="min-h-[40px] py-1 text-sm" value={to} onChange={(e) => set('to', e.target.value)} />
            </div>
          )}
        </Chip>
        {filtered && (
          <Button size="sm" variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            {t('dashboard.clear')}
          </Button>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="outline" aria-expanded={more} aria-controls="more-filters" onClick={() => setMore((m) => !m)} icon={<IconMore size={18} />}>
          {t('dashboard.moreFilters')}
        </Button>
      </div>
      {more && (
        <div id="more-filters" className="flex flex-wrap items-end gap-3 rounded-lg bg-surface-muted p-3">
          <div>
            <label htmlFor="f-type" className="mb-1 block text-xs font-semibold text-ink-muted">{t('dashboard.leakType')}</label>
            <Select id="f-type" className="min-h-[40px] py-1 text-sm" value={params.get('leak_type') ?? ''} onChange={(e) => set('leak_type', e.target.value)}>
              <option value="">{t('dashboard.any')}</option>
              {LEAK_TYPES.map((s) => <option key={s} value={s}>{t(`leakType.${s}`)}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="f-sort" className="mb-1 block text-xs font-semibold text-ink-muted">{t('dashboard.sort')}</label>
            <Select id="f-sort" className="min-h-[40px] py-1 text-sm" value={params.get('sort') ?? 'priority'} onChange={(e) => set('sort', e.target.value === 'priority' ? '' : e.target.value)}>
              {['priority', 'severity', 'newest', 'oldest'].map((s) => <option key={s} value={s}>{t(`dashboard.sorts.${s}`)}</option>)}
            </Select>
          </div>
          <label className="flex min-h-[40px] items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={params.get('in_view') === '1'} onChange={(e) => set('in_view', e.target.checked ? '1' : '')} />
            {t('dashboard.inView')}
          </label>
        </div>
      )}
    </div>
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
