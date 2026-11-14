import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { leakName, SeverityBadge, StatusBadge } from '../../components/ui/Badges';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Select } from '../../components/ui/Field';
import { IconClose, IconExternal, IconUsers, IconWarning } from '../../components/ui/Icons';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { api } from '../../lib/api';
import { directionsUrl, formatWhen, shortName } from '../../lib/format';
import { LEAK_TYPES, type ReportDetail, type Status } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { InvalidDialog, OverrideDialog } from './dialogs';
import { useBreakdownLabel } from './PriorityBreakdown';
import { useReportActions } from './useReportActions';

const MiniMap = lazy(() => import('../../components/map/MiniMap'));

const card = 'rounded-xl border border-surface-line bg-surface p-4';
const eyebrow = 'text-[11px] font-bold uppercase tracking-wider';
const linkButton =
  'min-h-[36px] rounded text-sm font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus';

function scoreColour(score: number) {
  if (score >= 80) return '#b91c1c';
  if (score >= 60) return '#c2410c';
  if (score >= 40) return '#a16207';
  return '#111827';
}

// DetailDrawer slides in from the right without hiding the page behind it,
// so the list and keyboard shortcuts keep working while it's open.
export function DetailDrawer({ id, onClose, onAssign }: { id: string; onClose: () => void; onAssign: () => void }) {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const reason = useBreakdownLabel();
  const q = useQuery({ queryKey: ['report', id], queryFn: () => api<ReportDetail>(`/utility/reports/${id}`) });
  const actions = useReportActions();
  const [dialog, setDialog] = useState<null | 'invalid' | 'priority' | 'severity' | 'merge' | { split: string }>(null);
  const [fixType, setFixType] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (q.data) headingRef.current?.focus({ preventScroll: true });
  }, [q.data?.report.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = q.data;
  const r = d?.report;
  const title = r
    ? (() => {
        const type = leakName(t, r.leak_type, r.is_main);
        const place = r.address_text.split(',')[0]?.trim() || r.zone_name;
        return place ? t('detail.titleOn', { type, place }) : type;
      })()
    : t('app.loading');

  const body = () => {
    if (q.isLoading)
      return (
        <div className="flex flex-col gap-4 p-5" role="status" aria-label={t('app.loading')}>
          <Skeleton className="aspect-[16/10] w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      );
    if (q.isError || !d || !r) return <div className="p-5"><ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></div>;

    const before = d.photos.filter((p) => p.kind === 'before');
    const after = d.photos.filter((p) => p.kind === 'after');
    const ai = before.find((p) => p.ai_labels && p.ai_labels.model !== 'off')?.ai_labels;
    const open = r.status !== 'fixed' && r.status !== 'invalid';
    const setStatus = (status: Status, message: string, note?: string) =>
      actions.update.mutate({ id: r.id, body: { status, note }, message, undo: { status: r.status, note: t('actions.undoNote') } });
    const history = [
      ...d.events.map((e) => ({
        at: e.created_at,
        text: t(`activity.status.${e.to_status}`) + (e.actor_name ? t('activity.by', { name: shortName(e.actor_name) }) : ''),
        note: e.note,
      })),
      ...d.audit.map((a) => ({
        at: a.created_at,
        text: t(`audit.${a.action}`, { defaultValue: a.action }) + (a.actor_name ? t('activity.by', { name: shortName(a.actor_name) }) : ''),
        note: String(a.details?.reason ?? ''),
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    const linkedCount = d.members.length;

    return (
      <div className="flex flex-col gap-4 p-5">
        {before[0] && (
          <a href={before[0].url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
            <img src={before[0].url} className="aspect-[16/10] w-full object-cover"
              alt={t('detail.photoAltBefore', { type: leakName(t, r.leak_type, r.is_main), label: ai ? t(`aiLabel.${ai.top.label}`) : '—' })} />
          </a>
        )}
        {(before.length > 1 || after.length > 0) && (
          <ul className="flex gap-2 overflow-x-auto" aria-label={t('detail.photos')}>
            {[...before.slice(1), ...after].map((p) => (
              <li key={p.id} className="relative shrink-0">
                <a href={p.url} target="_blank" rel="noreferrer" className="block focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
                  <img src={p.url} loading="lazy" className="h-16 w-24 rounded-lg object-cover"
                    alt={t(p.kind === 'after' ? 'detail.photoAltAfter' : 'detail.photoAltBefore', { type: leakName(t, r.leak_type, r.is_main), label: '—' })} />
                </a>
                <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 text-[10px] font-semibold text-white">{t(`detail.photoKind.${p.kind}`)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-4">
          <div className="h-[120px] w-[130px] shrink-0">
            <Suspense fallback={<Skeleton className="h-full w-full rounded-lg" />}>
              <MiniMap lat={r.lat} lng={r.lng} />
            </Suspense>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-semibold text-ink">{r.address_text || r.zone_name || '—'}</p>
            {r.address_text && r.zone_name && <p className="text-sm text-ink-muted">{r.zone_name}, Nairobi</p>}
            <a href={directionsUrl(r.lat, r.lng)} target="_blank" rel="noreferrer" className={`${linkButton} inline-flex items-center gap-1`}>
              {t('detail.directions')} <IconExternal size={14} />
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={r.status} size="sm" />
          <SeverityBadge severity={r.severity} size="sm" />
          {r.assignee_name && <span className="text-sm text-ink-muted">{t('detail.assignedTo', { name: r.assignee_name })}</span>}
        </div>

        {r.description && (
          <div className={card}>
            <p className={`${eyebrow} text-ink-muted`}>{t('detail.citizenNote')}</p>
            <p className="mt-1.5 text-ink">“{r.description}”</p>
          </div>
        )}

        {r.needs_review && (
          <div className="flex items-start gap-2 rounded-xl border border-warning-800/30 bg-warning-50 p-4 text-warning-800">
            <IconWarning size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">{t('detail.needsReview')}</p>
              <p className="mt-0.5 text-sm">{r.review_reason}</p>
            </div>
          </div>
        )}

        <section aria-labelledby="score-title" className={card}>
          <div className="flex items-center justify-between">
            <h3 id="score-title" className="text-sm font-semibold text-ink">{t('detail.priorityScore')}</h3>
            <span className="text-4xl font-semibold tabular-nums" style={{ color: scoreColour(r.priority_score) }}>
              <span aria-hidden="true">{r.priority_score}</span>
              <span className="sr-only">{t('priority.scoreLabel', { score: r.priority_score })}</span>
            </span>
          </div>
          <p className="mt-2 text-[15px] text-ink">{t('detail.whyScore')}</p>
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">{t('priority.breakdownCaption', { score: r.priority_score })}</caption>
            <tbody>
              {r.priority_breakdown.map((it, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2 text-ink-muted">{reason(it)}</td>
                  <td className={`py-1 text-right font-semibold tabular-nums ${it.points < 0 ? 'text-danger-700' : 'text-ink'}`}>
                    {it.points > 0 ? `+${it.points}` : it.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex flex-wrap gap-x-4 border-t border-surface-line pt-2">
            <button type="button" className={linkButton} onClick={() => setDialog('severity')}>{t('detail.changeSeverity')}</button>
            {r.priority_override != null && (
              <button type="button" className={linkButton}
                onClick={() => actions.update.mutate({
                  id: r.id, body: { clear_priority_override: true }, message: t('actions.overrideCleared'),
                  undo: { priority_override: r.priority_override!, priority_override_reason: r.priority_override_reason },
                })}>
                {t('detail.useComputed')}
              </button>
            )}
          </div>
        </section>

        {ai && (
          <section aria-labelledby="ai-title" className="rounded-xl border border-accent-600/25 bg-accent-50 p-4">
            <p id="ai-title" className={`${eyebrow} text-accent-800`}>{t('detail.flowSuggestion')}</p>
            <p className="mt-2 text-[15px] text-ink">{t('detail.looksLike', { label: t(`leakType.${ai.top.label === 'not_a_leak' ? 'unknown' : ai.top.label}`) })}</p>
            <p className="text-sm text-ink-muted">
              {ai.top.label === 'not_a_leak' ? t('detail.maybeNotLeak') : t('detail.sureFromPhoto', { pct: Math.round(ai.top.confidence * 100) })}
              {ai.reason && <span className="block">“{ai.reason}”</span>}
            </p>
            {r.needs_review ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => actions.update.mutate({ id: r.id, body: { accept_ai: true }, message: t('actions.accepted'), undo: { needs_review: true } })}>
                  {t('detail.accept')}
                </Button>
                <Button size="sm" variant="ghost" aria-expanded={fixType} onClick={() => setFixType((f) => !f)}>{t('detail.change')}</Button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-accent-800">{t('detail.checked')}</p>
            )}
            {fixType && (
              <div className="mt-3">
                <label htmlFor="fix-type" className="mb-1 block text-sm font-semibold">{t('detail.correctType')}</label>
                <Select id="fix-type" defaultValue="" className="min-h-[40px] py-1 text-sm"
                  onChange={(e) => {
                    if (!e.target.value) return;
                    actions.update.mutate({
                      id: r.id, body: { leak_type: e.target.value, accept_ai: true }, message: t('actions.corrected'),
                      undo: { leak_type: r.leak_type ?? undefined, needs_review: true },
                    });
                    setFixType(false);
                  }}>
                  <option value="" disabled>{t('detail.pickType')}</option>
                  {LEAK_TYPES.map((lt) => <option key={lt} value={lt}>{t(`leakType.${lt}`)}</option>)}
                </Select>
              </div>
            )}
          </section>
        )}

        <section aria-labelledby="linked-title" className={card}>
          <div className="flex items-center justify-between gap-2">
            <h3 id="linked-title" className="text-[15px] font-normal text-ink">{t('detail.linkedReports')}</h3>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{t('detail.reportCount', { count: linkedCount })}</span>
          </div>
          {d.suggestion && open ? (
            <>
              <p className="mt-2 text-sm text-ink-muted">
                {t('detail.duplicateOf', { ref: d.suggestion.reference_code, distance: d.suggestion.distance_m, count: d.suggestion.report_count })}
              </p>
              <button type="button" className={linkButton} onClick={() => setDialog('merge')}>
                {t('detail.mergeSuggested')} <kbd className="ml-1 rounded border border-brand-200 px-1 text-[10px]">M</kbd>
              </button>
            </>
          ) : linkedCount > 1 ? (
            <p className="mt-2 text-sm text-ink-muted">{t('detail.sameLeak')}</p>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">{t('detail.noLinked')}</p>
          )}
          {linkedCount > 1 && (
            <ul className="mt-2 flex flex-col divide-y divide-surface-line text-sm">
              {d.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    {m.reference_code}
                    {m.is_primary && <span className="ml-1 text-xs text-ink-muted">({t('detail.primary')})</span>}
                  </span>
                  <button type="button" className={linkButton} onClick={() => setDialog({ split: m.id })}>{t('detail.splitOut')}</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="action-title" className={card}>
          <h3 id="action-title" className="text-[15px] font-normal text-ink">{t('detail.takeAction')}</h3>
          <div className="mt-3 flex flex-col gap-2">
            {open ? (
              <>
                <Button size="lg" block icon={<IconUsers size={20} />} onClick={onAssign}>
                  {r.assignee_id ? t('detail.reassign') : t('detail.assignTech')}
                </Button>
                {r.status === 'received' && (
                  <Button variant="outline" block onClick={() => setStatus('verified', t('actions.verified'))}>{t('detail.verify')}</Button>
                )}
                <Button variant="outline" block onClick={() => setDialog('priority')}>{t('detail.changePriority')}</Button>
                <Button variant="ghost" block className="text-ink" onClick={() => setDialog('invalid')}>{t('detail.markInvalid')}</Button>
              </>
            ) : (
              <Button variant="outline" block onClick={() => setStatus('verified', t('actions.reopened'))}>{t('detail.reopen')}</Button>
            )}
          </div>
        </section>

        <section aria-labelledby="activity-title" className={card}>
          <h3 id="activity-title" className="text-[15px] font-normal text-ink">{t('detail.activity')}</h3>
          <ol className="mt-3 flex flex-col">
            {history.map((h, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < history.length - 1 && <span className="absolute left-[3px] top-3 h-full w-px bg-surface-line" aria-hidden="true" />}
                <span className="z-10 mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full bg-brand-600" aria-hidden="true" />
                <div className="flex flex-col">
                  <span className="text-sm text-ink">{h.text}</span>
                  {h.note && <span className="text-sm text-ink-muted">“{h.note}”</span>}
                  <span className="text-xs text-ink-subtle">{formatWhen(h.at, t, i18n.language)}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <InvalidDialog open={dialog === 'invalid'} onClose={() => setDialog(null)}
          onConfirm={(note) => { setStatus('invalid', t('actions.invalid'), note); setDialog(null); }} />
        <OverrideDialog kind="priority" open={dialog === 'priority'} current={r.priority_score} onClose={() => setDialog(null)}
          onSave={(value, why) => {
            actions.update.mutate({
              id: r.id, body: { priority_override: Number(value), priority_override_reason: why }, message: t('actions.prioritySet', { score: value }),
              undo: r.priority_override != null
                ? { priority_override: r.priority_override, priority_override_reason: r.priority_override_reason }
                : { clear_priority_override: true },
            });
            setDialog(null);
          }} />
        <OverrideDialog kind="severity" open={dialog === 'severity'} current={r.severity ?? 'medium'} onClose={() => setDialog(null)}
          onSave={(value, why) => {
            actions.update.mutate({
              id: r.id, body: { severity: String(value), severity_reason: why }, message: t('actions.severitySet', { severity: t(`severity.${value}`) }),
              undo: r.severity ? { severity: r.severity, severity_reason: t('actions.undoNote') } : undefined,
            });
            setDialog(null);
          }} />
        <ConfirmDialog open={dialog === 'merge'} title={t('detail.mergeTitle')} confirmLabel={t('detail.merge')}
          body={t('detail.mergeBody', { ref: d.suggestion?.reference_code })} loading={actions.merge.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            if (d.suggestion && r.cluster_id) actions.merge.mutate({ target: d.suggestion.cluster_id, source: r.cluster_id });
            setDialog(null);
          }} />
        <ConfirmDialog open={typeof dialog === 'object' && dialog !== null} title={t('detail.splitTitle')} confirmLabel={t('detail.splitOut')}
          body={t('detail.splitBody')} onCancel={() => setDialog(null)}
          onConfirm={() => {
            if (typeof dialog === 'object' && dialog && r.cluster_id) actions.split.mutate({ clusterId: r.cluster_id, reportIds: [dialog.split] });
            setDialog(null);
          }} />
      </div>
    );
  };

  return (
    <aside
      aria-labelledby="drawer-title"
      className="fixed inset-y-0 right-0 z-[1400] flex w-full flex-col border-l border-surface-line bg-[#fbfcfd] shadow-[-12px_0_40px_-12px_rgba(15,44,74,0.25)] sm:w-[440px]"
    >
      <header className="flex items-start gap-3 border-b border-surface-line bg-surface px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold tracking-wide text-brand-700">{r?.reference_code}</p>
          <h2 id="drawer-title" ref={headingRef} tabIndex={-1} className="text-xl font-normal leading-snug text-ink-heading outline-none">{title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label={t('detail.close')}
          className="-mr-2 flex min-h-touch min-w-touch items-center justify-center rounded-full text-ink hover:bg-surface-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
          <IconClose />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </aside>
  );
}

