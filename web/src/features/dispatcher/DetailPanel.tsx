import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { LeakTypeLabel, PriorityScore, SeverityBadge, StatusBadge } from '../../components/ui/Badges';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { Field, Select, TextArea, TextInput } from '../../components/ui/Field';
import { IconClose, IconExternal, IconInfo, IconLayers, IconWarning } from '../../components/ui/Icons';
import { ErrorState, Notice, Skeleton } from '../../components/ui/States';
import { api } from '../../lib/api';
import { directionsUrl, formatDateTime, timeAgo } from '../../lib/format';
import { LEAK_TYPES, SEVERITIES, type ReportDetail, type Status } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { PriorityBreakdown } from './PriorityBreakdown';
import { useReportActions } from './useReportActions';

export function DetailPanel({ id, onClose, onAssign }: { id: string; onClose: () => void; onAssign: () => void }) {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const q = useQuery({ queryKey: ['report', id], queryFn: () => api<ReportDetail>(`/utility/reports/${id}`) });
  const actions = useReportActions();
  const [dialog, setDialog] = useState<null | 'invalid' | 'priority' | 'severity' | 'merge' | { split: string }>(null);
  const [fixType, setFixType] = useState(false);

  if (q.isLoading)
    return (
      <div className="flex flex-col gap-3 p-4" role="status" aria-label={t('app.loading')}>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (q.isError) return <div className="p-4"><ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></div>;
  const d = q.data!;
  const r = d.report;
  const aiPhoto = d.photos.find((p) => p.kind === 'before' && p.ai_labels)?.ai_labels;
  const open = r.status !== 'fixed' && r.status !== 'invalid';

  const setStatus = (status: Status, message: string, note?: string) =>
    actions.update.mutate({ id: r.id, body: { status, note }, message, undo: { status: r.status, note: t('actions.undoNote') } });

  return (
    <article aria-labelledby="detail-title" className="flex flex-col gap-4 p-4">
      <header className="flex items-start gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <h2 id="detail-title" className="flex flex-wrap items-center gap-2 text-lg font-bold">
            <LeakTypeLabel type={r.leak_type} />
            <span className="font-mono text-sm font-normal text-ink-subtle">{r.reference_code}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} size="sm" />
            <SeverityBadge severity={r.severity} size="sm" />
            {r.assignee_name && <span className="text-sm text-ink-muted">{t('detail.assignedTo', { name: r.assignee_name })}</span>}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label={t('detail.close')}
          className="flex min-h-touch min-w-touch items-center justify-center rounded text-ink-muted hover:bg-surface-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
          <IconClose />
        </button>
      </header>

      {/* Main actions: one obvious next step, the rest secondary. */}
      {open ? (
        <div className="flex flex-wrap gap-2">
          {r.status === 'received' && (
            <Button size="sm" onClick={() => setStatus('verified', t('actions.verified'))}>
              {t('detail.verify')} <kbd className="ml-1 rounded bg-white/20 px-1 text-xs">V</kbd>
            </Button>
          )}
          <Button size="sm" variant={r.status === 'received' ? 'secondary' : 'primary'} onClick={onAssign}>
            {r.assignee_id ? t('detail.reassign') : t('detail.assign')} <kbd className="ml-1 rounded bg-black/10 px-1 text-xs">A</kbd>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDialog('invalid')}>{t('detail.markInvalid')}</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setStatus('verified', t('actions.reopened'))}>{t('detail.reopen')}</Button>
        </div>
      )}

      {r.needs_review && (
        <section className="flex flex-col gap-2 rounded-lg border-2 border-warning-800/40 bg-warning-50 p-3">
          <h3 className="flex items-center gap-1.5 font-semibold text-warning-800"><IconWarning size={18} />{t('detail.needsReview')}</h3>
          <p className="text-sm">{r.review_reason}</p>
          {aiPhoto && (
            <p className="text-sm">
              {t('detail.aiSays', { label: t(`aiLabel.${aiPhoto.top.label}`), pct: Math.round(aiPhoto.top.confidence * 100) })}
              {aiPhoto.reason && <span className="block text-ink-muted">“{aiPhoto.reason}”</span>}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => actions.update.mutate({ id: r.id, body: { accept_ai: true }, message: t('actions.accepted'), undo: { needs_review: true } })}>
              {t('detail.accept')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setFixType(true)}>{t('detail.notRight')}</Button>
          </div>
          {fixType && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1">
                <label htmlFor="fix-type" className="mb-1 block text-sm font-semibold">{t('detail.correctType')}</label>
                <Select id="fix-type" defaultValue={r.leak_type ?? ''} className="min-h-[40px] py-1 text-sm"
                  onChange={(e) =>
                    e.target.value &&
                    actions.update.mutate({
                      id: r.id,
                      body: { leak_type: e.target.value, accept_ai: true },
                      message: t('actions.corrected'),
                      undo: { leak_type: r.leak_type ?? undefined, needs_review: true },
                    })
                  }>
                  <option value="" disabled>{t('detail.pickType')}</option>
                  {LEAK_TYPES.map((lt) => <option key={lt} value={lt}>{t(`leakType.${lt}`)}</option>)}
                </Select>
              </div>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="prio-title" className="flex flex-col gap-2 rounded-lg bg-surface-muted p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 id="prio-title" className="font-semibold">{t('priority.title')}</h3>
          <PriorityScore score={r.priority_score} overridden={r.priority_override != null} />
        </div>
        <PriorityBreakdown items={r.priority_breakdown} score={r.priority_score} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setDialog('priority')}>{t('detail.changePriority')}</Button>
          {r.priority_override != null && (
            <Button size="sm" variant="ghost"
              onClick={() => actions.update.mutate({
                id: r.id, body: { clear_priority_override: true }, message: t('actions.overrideCleared'),
                undo: { priority_override: r.priority_override!, priority_override_reason: r.priority_override_reason },
              })}>
              {t('detail.useComputed')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDialog('severity')}>{t('detail.changeSeverity')}</Button>
        </div>
        {r.severity_source === 'dispatcher' && r.severity_reason && (
          <p className="text-xs text-ink-muted">{t('detail.severitySetBy', { reason: r.severity_reason })}</p>
        )}
      </section>

      {d.suggestion && open && (
        <section className="flex flex-col gap-2 rounded-lg border-2 border-brand-200 bg-brand-50 p-3">
          <h3 className="flex items-center gap-1.5 font-semibold text-brand-900"><IconLayers size={18} />{t('detail.possibleDuplicate')}</h3>
          <p className="text-sm">
            {t('detail.duplicateOf', { ref: d.suggestion.reference_code, distance: d.suggestion.distance_m, count: d.suggestion.report_count })}
          </p>
          <div><Button size="sm" onClick={() => setDialog('merge')}>{t('detail.merge')} <kbd className="ml-1 rounded bg-white/20 px-1 text-xs">M</kbd></Button></div>
        </section>
      )}

      {d.photos.length > 0 && (
        <section aria-labelledby="photos-title">
          <h3 id="photos-title" className="mb-2 font-semibold">{t('detail.photos')}</h3>
          <ul className="grid grid-cols-2 gap-2">
            {d.photos.map((p) => (
              <li key={p.id} className="flex flex-col gap-1">
                <a href={p.url} target="_blank" rel="noreferrer" className="block focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
                  <img src={p.url} loading="lazy" className="aspect-[4/3] w-full rounded object-cover"
                    alt={t(p.kind === 'after' ? 'detail.photoAltAfter' : 'detail.photoAltBefore', {
                      type: t(`leakType.${r.leak_type ?? 'unknown'}`),
                      label: p.ai_labels ? t(`aiLabel.${p.ai_labels.top.label}`) : '—',
                    })} />
                </a>
                <span className="text-xs text-ink-muted">
                  {t(`detail.photoKind.${p.kind}`)}
                  {p.ai_labels && ` · ${t(`aiLabel.${p.ai_labels.top.label}`)} ${Math.round(p.ai_labels.top.confidence * 100)}%`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="details-title">
        <h3 id="details-title" className="mb-2 font-semibold">{t('detail.details')}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-ink-muted">{t('detail.size')}</dt>
          <dd>{r.size_estimate ? t(`report.sizes.${r.size_estimate}`) : '—'}</dd>
          <dt className="text-ink-muted">{t('detail.duration')}</dt>
          <dd>{r.duration ? t(`report.durations.${r.duration}`) : '—'}</dd>
          <dt className="text-ink-muted">{t('detail.pipe')}</dt>
          <dd>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={r.is_main}
                onChange={(e) => actions.update.mutate({ id: r.id, body: { is_main: e.target.checked }, message: t('actions.saved'), undo: { is_main: r.is_main } })} />
              {t('detail.isMain')}
            </label>
          </dd>
          <dt className="text-ink-muted">{t('detail.where')}</dt>
          <dd>
            {[r.address_text, r.zone_name].filter(Boolean).join(', ') || '—'}{' '}
            <a className="inline-flex items-center gap-1 text-brand-700 underline" href={directionsUrl(r.lat, r.lng)} target="_blank" rel="noreferrer">
              {t('detail.directions')} <IconExternal size={14} />
            </a>
          </dd>
          <dt className="text-ink-muted">{t('detail.reported')}</dt>
          <dd>{formatDateTime(r.created_at, i18n.language)} ({timeAgo(r.created_at, t)})</dd>
          <dt className="text-ink-muted">{t('detail.updates')}</dt>
          <dd>{r.has_reporter_phone ? t('detail.smsOn') : t('detail.smsOff')}</dd>
        </dl>
        {r.description && <p className="mt-2 rounded bg-surface-muted p-2 text-sm">“{r.description}”</p>}
      </section>

      {d.members.length > 1 && (
        <section aria-labelledby="members-title">
          <h3 id="members-title" className="mb-2 font-semibold">{t('detail.group', { count: d.members.length })}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {d.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded bg-surface-muted px-2 py-1">
                <span>
                  <span className="font-mono">{m.reference_code}</span> · {timeAgo(m.created_at, t)}
                  {m.is_primary && <span className="ml-1 text-xs text-ink-muted">({t('detail.primary')})</span>}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setDialog({ split: m.id })}>{t('detail.splitOut')}</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="history-title">
        <h3 id="history-title" className="mb-2 font-semibold">{t('detail.history')}</h3>
        <ol className="flex flex-col gap-1.5 text-sm">
          {[
            ...d.events.map((e) => ({ at: e.created_at, text: t('detail.eventStatus', { status: t(`status.${e.to_status}`) }), who: e.actor_name, note: e.note })),
            ...d.audit.map((a) => ({ at: a.created_at, text: t(`audit.${a.action}`, { defaultValue: a.action }), who: a.actor_name, note: String(a.details?.reason ?? '') })),
          ]
            .sort((a, b) => a.at.localeCompare(b.at))
            .map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-28 shrink-0 text-ink-subtle">{formatDateTime(h.at, i18n.language)}</span>
                <span>
                  {h.text}
                  {h.who && <span className="text-ink-muted"> · {h.who}</span>}
                  {h.note && <span className="block text-ink-muted">“{h.note}”</span>}
                </span>
              </li>
            ))}
        </ol>
      </section>

      <InvalidDialog open={dialog === 'invalid'} onClose={() => setDialog(null)}
        onConfirm={(note) => {
          setStatus('invalid', t('actions.invalid'), note);
          setDialog(null);
        }} />
      <OverrideDialog kind="priority" open={dialog === 'priority'} current={r.priority_score} onClose={() => setDialog(null)}
        onSave={(value, reason) => {
          actions.update.mutate({
            id: r.id, body: { priority_override: Number(value), priority_override_reason: reason }, message: t('actions.prioritySet', { score: value }),
            undo: r.priority_override != null
              ? { priority_override: r.priority_override, priority_override_reason: r.priority_override_reason }
              : { clear_priority_override: true },
          });
          setDialog(null);
        }} />
      <OverrideDialog kind="severity" open={dialog === 'severity'} current={r.severity ?? 'medium'} onClose={() => setDialog(null)}
        onSave={(value, reason) => {
          actions.update.mutate({
            id: r.id, body: { severity: String(value), severity_reason: reason }, message: t('actions.severitySet', { severity: t(`severity.${value}`) }),
            undo: r.severity ? { severity: r.severity, severity_reason: t('actions.undoNote') } : undefined,
          });
          setDialog(null);
        }} />
      <ConfirmDialog open={dialog === 'merge'} title={t('detail.mergeTitle')} confirmLabel={t('detail.merge')}
        body={t('detail.mergeBody', { ref: d.suggestion?.reference_code })}
        loading={actions.merge.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (d.suggestion && r.cluster_id) actions.merge.mutate({ target: d.suggestion.cluster_id, source: r.cluster_id });
          setDialog(null);
        }} />
      <ConfirmDialog open={typeof dialog === 'object' && dialog !== null} title={t('detail.splitTitle')} confirmLabel={t('detail.splitOut')}
        body={t('detail.splitBody')}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (typeof dialog === 'object' && dialog && r.cluster_id) actions.split.mutate({ clusterId: r.cluster_id, reportIds: [dialog.split] });
          setDialog(null);
        }} />
    </article>
  );
}

function InvalidDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
  const { t } = useTranslation();
  const { register, handleSubmit, formState, reset } = useForm<{ note: string }>({
    resolver: zodResolver(z.object({ note: z.string().trim().min(3, t('detail.reasonRequired')).max(500) })),
  });
  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} title={t('detail.invalidTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => void handleSubmit((v) => { onConfirm(v.note); reset(); })()}>{t('detail.markInvalid')}</Button>
        </>
      }>
      <div className="flex flex-col gap-3">
        <Notice tone="warning"><IconInfo size={18} className="mt-0.5 shrink-0" /><span>{t('detail.invalidBody')}</span></Notice>
        <Field label={t('detail.reasonForCitizen')} error={formState.errors.note?.message}>
          {({ id, describedBy, invalid }) => <TextArea id={id} aria-describedby={describedBy} invalid={invalid} rows={3} {...register('note')} />}
        </Field>
      </div>
    </Dialog>
  );
}

function OverrideDialog({ kind, open, current, onClose, onSave }: {
  kind: 'priority' | 'severity';
  open: boolean;
  current: number | string;
  onClose: () => void;
  onSave: (value: number | string, reason: string) => void;
}) {
  const { t } = useTranslation();
  const schema = z.object({
    value: kind === 'priority' ? z.coerce.number().int().min(0, t('detail.range')).max(100, t('detail.range')) : z.string().min(1),
    reason: z.string().trim().min(3, t('detail.reasonRequired')).max(500),
  });
  const { register, handleSubmit, formState, reset } = useForm<{ value: number | string; reason: string }>({
    resolver: zodResolver(schema),
    values: { value: current, reason: '' },
  });
  const close = () => { reset(); onClose(); };
  return (
    <Dialog open={open} onClose={close} title={t(kind === 'priority' ? 'detail.changePriority' : 'detail.changeSeverity')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
          <Button onClick={() => void handleSubmit((v) => onSave(v.value, v.reason))()}>{t('common.save')}</Button>
        </>
      }>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">{t('detail.overrideHint')}</p>
        <Field label={t(kind === 'priority' ? 'detail.newPriority' : 'detail.newSeverity')} error={formState.errors.value?.message}>
          {({ id, describedBy, invalid }) =>
            kind === 'priority' ? (
              <TextInput id={id} aria-describedby={describedBy} invalid={invalid} type="number" min={0} max={100} {...register('value')} />
            ) : (
              <Select id={id} aria-describedby={describedBy} {...register('value')}>
                {SEVERITIES.map((s) => <option key={s} value={s}>{t(`severity.${s}`)}</option>)}
              </Select>
            )
          }
        </Field>
        <Field label={t('detail.reason')} hint={t('detail.reasonHint')} error={formState.errors.reason?.message}>
          {({ id, describedBy, invalid }) => <TextArea id={id} aria-describedby={describedBy} invalid={invalid} rows={2} {...register('reason')} />}
        </Field>
      </div>
    </Dialog>
  );
}
