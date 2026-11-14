import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { ChoiceCards } from '../../../components/ui/ChoiceCards';
import { Field, TextArea, TextInput } from '../../../components/ui/Field';
import { CitizenShell } from '../../../components/ui/Layout';
import { IconDrop, IconLock, IconWarning, leakTypeIcon } from '../../../components/ui/Icons';
import { ProgressSteps } from '../../../components/ui/ProgressSteps';
import { Notice } from '../../../components/ui/States';
import { api, ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { queueReport } from '../../../lib/drafts';
import { timeAgo } from '../../../lib/format';
import { submitReport } from '../../../lib/submit';
import type { CreateReportResult, Duration, LeakType, NearbyMatch, Size } from '../../../lib/types';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useFlow } from './ReportFlow';

const kenyanPhone = /^(?:\+?254|0)?[17]\d{8}$/;

function makeSchema(t: (k: string) => string, noPhoto: boolean) {
  return z.object({
    description: z
      .string()
      .max(1000, t('report.details.descriptionTooLong'))
      .refine((v) => !noPhoto || v.trim().length > 0, t('report.details.descriptionRequired')),
    phone: z
      .string()
      .refine((v) => v.trim() === '' || kenyanPhone.test(v.replace(/[\s-]/g, '')), t('report.details.phoneInvalid')),
  });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

// Small drop icons for size, so the choice reads at a glance.
const SizeIcon = (n: number) =>
  function Drops(p: { size?: number; className?: string }) {
    return (
      <span className={`inline-flex ${p.className ?? ''}`} aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <IconDrop key={i} size={(p.size ?? 28) * 0.6} />
        ))}
      </span>
    );
  };

export default function DetailsStep() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const errorMessage = useErrorMessage();
  const { user } = useAuth();
  const { draft, update } = useFlow();
  const [progress, setProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [dupChoice, setDupChoice] = useState<'join' | 'different' | null>(draft.joinClusterId ? 'join' : null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(makeSchema(t, !!draft.noPhoto)),
    defaultValues: { description: draft.description ?? '', phone: draft.phone ?? user?.phone?.replace('+254', '0') ?? '' },
  });

  // Keep the saved draft in step with the form.
  useEffect(() => {
    const sub = watch((v) => update({ description: v.description, phone: v.phone }));
    return () => sub.unsubscribe();
  }, [watch, update]);

  const leakType = draft.leakType && draft.leakType !== 'unsure' ? draft.leakType : '';
  const nearby = useQuery({
    queryKey: ['nearby', draft.lat?.toFixed(5), draft.lng?.toFixed(5), leakType],
    queryFn: () => api<{ covered: boolean; matches: NearbyMatch[] }>(`/reports/nearby?lat=${draft.lat}&lng=${draft.lng}&leak_type=${leakType}`),
    staleTime: 60_000,
  });
  const match = nearby.data?.matches[0];

  const onSubmit = handleSubmit(async () => {
    setSubmitError('');
    const payload = { ...draft, joinClusterId: dupChoice === 'join' ? match?.cluster_id ?? draft.joinClusterId : undefined };
    setProgress(0);
    try {
      const res = await submitReport(payload, i18n.language, setProgress);
      // Done clears the draft once it's on screen; clearing here would let the
      // step guard redirect before this navigation lands.
      nav('/report/done', { state: res satisfies CreateReportResult, replace: true });
    } catch (e) {
      setProgress(null);
      if (e instanceof ApiError && e.isNetwork) {
        // Weak signal: keep the report on the phone and send it later.
        await queueReport({ ...payload, locale: i18n.language });
        nav('/report/done', { state: { offline: true }, replace: true });
        return;
      }
      if (e instanceof ApiError && e.fields.description) setError('description', { message: e.fields.description });
      if (e instanceof ApiError && e.fields.phone) setError('phone', { message: e.fields.phone });
      setSubmitError(errorMessage(e));
    }
  });

  const steps = [t('report.steps.photo'), t('report.steps.location'), t('report.steps.details')];
  const leakOptions = (['burst_pipe', 'pooling', 'dripping', 'sewage', 'unsure'] as const).map((v) => ({
    value: v,
    label: t(`report.leakTypes.${v}`),
    hint: t(`report.leakTypeHints.${v}`),
    icon: leakTypeIcon[v],
  }));
  const submitting = progress !== null;

  return (
    <CitizenShell
      title={t('report.title')}
      back={{ to: '/report/location', label: t('app.back') }}
      bottom={
        <>
          {submitting && (
            <div role="status" className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {progress! < 100 ? t('report.uploading', { pct: progress }) : t('report.submitting')}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                <span className="block h-full bg-brand-600 transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} />
              </span>
            </div>
          )}
          <Button size="lg" block onClick={() => void onSubmit()} loading={submitting}>
            {dupChoice === 'join' ? t('report.duplicate.submitJoin') : t('report.submit')}
          </Button>
        </>
      }
    >
      <ProgressSteps step={3} total={3} labels={steps} />
      <div>
        <h2 className="text-2xl font-bold">{t('report.details.title')}</h2>
        <p className="mt-1 text-ink-muted">{t('report.details.lead')}</p>
      </div>

      <form className="flex flex-col gap-6" onSubmit={(e) => void onSubmit(e)} noValidate>
        <ChoiceCards<LeakType | 'unsure'>
          legend={t('report.details.leakType')}
          optional
          optionalLabel={t('common.optional')}
          options={leakOptions}
          value={draft.leakType}
          onChange={(v) => update({ leakType: v })}
          columns={1}
        />

        {match && dupChoice !== 'different' && (
          <section aria-labelledby="dup-title" className="flex flex-col gap-3 rounded-xl border-2 border-warning-800/40 bg-warning-50 p-4">
            <h3 id="dup-title" className="flex items-center gap-2 font-semibold text-warning-800">
              <IconWarning size={20} />
              {t('report.duplicate.title')}
            </h3>
            <p className="text-ink">
              {t('report.duplicate.body', {
                count: match.report_count,
                distance: match.distance_m,
                when: timeAgo(match.created_at, t),
                type: t(`leakType.${match.leak_type ?? 'unknown'}`),
              })}
            </p>
            {dupChoice === 'join' ? (
              <p className="font-medium text-success-700" role="status">
                {t('report.duplicate.willJoin', { ref: match.reference_code })}
              </p>
            ) : (
              <p className="text-sm text-ink-muted">{t('report.duplicate.why')}</p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant={dupChoice === 'join' ? 'primary' : 'secondary'} aria-pressed={dupChoice === 'join'} onClick={() => setDupChoice('join')}>
                {t('report.duplicate.add')}
              </Button>
              <Button variant="ghost" onClick={() => setDupChoice('different')}>
                {t('report.duplicate.different')}
              </Button>
            </div>
          </section>
        )}

        <ChoiceCards<Size>
          legend={t('report.details.size')}
          optional
          optionalLabel={t('common.optional')}
          options={(['small', 'medium', 'large'] as const).map((v, i) => ({ value: v, label: t(`report.sizes.${v}`), icon: SizeIcon(i + 1) }))}
          value={draft.size}
          onChange={(v) => update({ size: v })}
          columns={3}
        />

        <ChoiceCards<Duration>
          legend={t('report.details.duration')}
          optional
          optionalLabel={t('common.optional')}
          options={(['today', 'days', 'week'] as const).map((v) => ({ value: v, label: t(`report.durations.${v}`) }))}
          value={draft.duration}
          onChange={(v) => update({ duration: v })}
          columns={3}
        />

        <Field
          label={t('report.details.description')}
          hint={draft.noPhoto ? t('report.details.descriptionHintNoPhoto') : t('report.details.descriptionHint')}
          optional={!draft.noPhoto}
          error={errors.description?.message}
        >
          {({ id, describedBy, invalid }) => (
            <TextArea id={id} aria-describedby={describedBy} invalid={invalid} rows={3} maxLength={1000} {...register('description')} />
          )}
        </Field>

        <Field label={t('report.details.phone')} hint={t('report.details.phoneHint')} optional error={errors.phone?.message}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0712 345 678"
              {...register('phone')}
            />
          )}
        </Field>

        <Notice>
          <IconLock size={18} className="mt-0.5 shrink-0" />
          <span>{t('report.details.privacy')}</span>
        </Notice>

        {submitError && (
          <p role="alert" className="font-medium text-danger-700">
            {submitError}
          </p>
        )}
      </form>
    </CitizenShell>
  );
}
