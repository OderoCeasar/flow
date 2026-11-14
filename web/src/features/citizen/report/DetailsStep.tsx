import { useEffect, useId, useState, type ComponentType, type SVGProps } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { TextArea } from '../../../components/ui/Field';
import { CitizenShell, PageHeading } from '../../../components/ui/Layout';
import { IconCheck, IconLock, IconUsers, IconWarning, leakTypeIcon } from '../../../components/ui/Icons';
import { ProgressSteps } from '../../../components/ui/ProgressSteps';
import { Notice } from '../../../components/ui/States';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { queueReport } from '../../../lib/drafts';
import { submitReport } from '../../../lib/submit';
import type { CreateReportResult, Duration, LeakType, Size } from '../../../lib/types';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useFlow } from './ReportFlow';

// Accepts what people type after the +254 prefix (712 345 678) or a full number.
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

const sectionTitle = 'mb-3 font-semibold text-ink';
const focusRing = 'has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus';

// Leak types as picture tiles, two by two. Native radios underneath keep
// keyboard and screen-reader behaviour.
function TileChoices<V extends string>({ legend, options, value, onChange }: {
  legend: string;
  options: { value: V; label: string; icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }> }[];
  value?: V;
  onChange: (v: V) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className={sectionTitle}>{legend}</legend>
      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label key={o.value}
              className={`relative flex min-h-[104px] cursor-pointer flex-col justify-between gap-3 rounded-xl border p-3.5 transition-colors motion-reduce:transition-none ${focusRing} ${
                checked ? 'border-2 border-brand-600 bg-brand-50/70' : 'border-surface-line bg-surface hover:border-brand-300'}`}>
              <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} className="sr-only" />
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700" aria-hidden="true">
                <o.icon size={20} />
              </span>
              <span className={`text-sm font-semibold leading-snug ${checked ? 'text-brand-800' : 'text-ink'}`}>{o.label}</span>
              {checked && (
                <span className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white" aria-hidden="true">
                  <IconCheck size={14} strokeWidth={3} />
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// Three short answers side by side.
function SegmentedChoices<V extends string>({ legend, options, value, onChange }: {
  legend: string;
  options: { value: V; label: string }[];
  value?: V;
  onChange: (v: V) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className={sectionTitle}>{legend}</legend>
      <div className="grid grid-cols-3 gap-2.5">
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label key={o.value}
              className={`flex min-h-[52px] cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm font-semibold transition-colors motion-reduce:transition-none ${focusRing} ${
                checked ? 'border-2 border-brand-600 bg-brand-50/70 text-brand-800' : 'border-surface-line bg-surface text-ink hover:border-brand-300'}`}>
              <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} className="sr-only" />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function DetailsStep() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const errorMessage = useErrorMessage();
  const { user } = useAuth();
  const { draft, update } = useFlow();
  const [progress, setProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState('');
  const sms = draft.smsUpdates ?? true;

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(makeSchema(t, !!draft.noPhoto)),
    defaultValues: { description: draft.description ?? '', phone: draft.phone ?? user?.phone?.replace(/^\+254/, '') ?? '' },
  });

  // Keep the saved draft in step with the form.
  useEffect(() => {
    const sub = watch((v) => update({ description: v.description, phone: v.phone }));
    return () => sub.unsubscribe();
  }, [watch, update]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError('');
    // Only send the number if the citizen wants updates.
    const digits = values.phone.replace(/[\s-]/g, '');
    const phone = sms && digits ? (/^[17]\d{8}$/.test(digits) ? `+254${digits}` : digits) : undefined;
    const payload = { ...draft, phone };
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
  const submitting = progress !== null;
  const noteError = errors.description?.message;
  const phoneError = errors.phone?.message;

  return (
    <CitizenShell
      back={{ to: '/report/location', label: t('app.back') }}
      bottom={
        <>
          {submitting && (
            <div role="status" className="flex flex-col gap-1">
              <span className="text-sm font-medium">{progress! < 100 ? t('report.uploading', { pct: progress }) : t('report.submitting')}</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                <span className="block h-full bg-brand-600 transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} />
              </span>
            </div>
          )}
          <Button size="lg" block onClick={() => void onSubmit()} loading={submitting}>
            {draft.joinClusterId ? t('report.duplicate.submitJoin') : t('report.submit')}
          </Button>
        </>
      }
    >
      <ProgressSteps step={3} total={3} labels={steps} />
      <PageHeading title={t('report.details.title')} lead={t('report.details.lead')} />

      {draft.joinClusterId && (
        <div className="flex items-start gap-3 rounded-xl bg-[#fdf6e7] p-4" role="status">
          <IconUsers size={20} className="mt-0.5 shrink-0 text-[#9a5a06]" />
          <div className="flex flex-1 flex-col items-start gap-1">
            <p className="text-sm text-ink">{t('report.duplicate.willJoin', { ref: draft.joinRef ?? '' })}</p>
            <button type="button" onClick={() => update({ joinClusterId: undefined, joinRef: undefined })}
              className="min-h-[36px] rounded text-sm font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
              {t('report.duplicate.different')}
            </button>
          </div>
        </div>
      )}

      <form className="flex flex-col gap-7" onSubmit={(e) => void onSubmit(e)} noValidate>
        <TileChoices<LeakType>
          legend={t('report.details.leakType')}
          options={(['burst_pipe', 'dripping', 'pooling', 'sewage'] as const).map((v) => ({ value: v, label: t(`report.leakTypes.${v}`), icon: leakTypeIcon[v] }))}
          value={draft.leakType === 'unsure' ? undefined : draft.leakType}
          onChange={(v) => update({ leakType: v })}
        />
        <SegmentedChoices<Size>
          legend={t('report.details.size')}
          options={(['small', 'medium', 'large'] as const).map((v) => ({ value: v, label: t(`report.sizes.${v}`) }))}
          value={draft.size}
          onChange={(v) => update({ size: v })}
        />
        <SegmentedChoices<Duration>
          legend={t('report.details.duration')}
          options={(['today', 'days', 'week'] as const).map((v) => ({ value: v, label: t(`report.durations.${v}`) }))}
          value={draft.duration}
          onChange={(v) => update({ duration: v })}
        />

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="note" className="font-semibold text-ink">{t('report.details.description')}</label>
            <span className="text-sm text-ink-muted">{draft.noPhoto ? t('report.details.required') : t('common.optionalCap')}</span>
          </div>
          {draft.noPhoto && <p id="note-hint" className="text-sm text-ink-muted">{t('report.details.descriptionHintNoPhoto')}</p>}
          <TextArea id="note" rows={3} maxLength={1000} placeholder={t('report.details.notePlaceholder')} invalid={!!noteError}
            aria-describedby={[noteError ? 'note-err' : '', draft.noPhoto ? 'note-hint' : ''].filter(Boolean).join(' ') || undefined}
            {...register('description')} />
          {noteError && (
            <p id="note-err" role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger-700">
              <IconWarning size={16} className="mt-0.5 shrink-0" /> {noteError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="phone" className="font-semibold text-ink">{t('report.details.phone')}</label>
            <span className="text-sm text-ink-muted">{t('common.optionalCap')}</span>
          </div>
          <div className={`flex min-h-touch items-center rounded border-2 bg-surface focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-200 ${
            phoneError ? 'border-danger-600' : 'border-surface-line'}`}>
            <span className="border-r border-surface-line px-3 font-semibold text-ink" aria-hidden="true">+254</span>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="712 345 678"
              aria-invalid={!!phoneError || undefined} aria-describedby={phoneError ? 'phone-err sms-hint' : 'sms-hint'}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base text-ink placeholder:text-ink-subtle focus:outline-none"
              {...register('phone')} />
          </div>
          {phoneError && (
            <p id="phone-err" role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger-700">
              <IconWarning size={16} className="mt-0.5 shrink-0" /> {phoneError}
            </p>
          )}
          <label className="mt-1 flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" checked={sms} onChange={(e) => update({ smsUpdates: e.target.checked })} />
            <span className="flex flex-col">
              <span className="font-semibold text-ink">{t('report.details.smsUpdates')}</span>
              <span id="sms-hint" className="text-sm text-ink-muted">{t('report.details.smsHint')}</span>
            </span>
          </label>
        </div>

        <Notice>
          <IconLock size={18} className="mt-0.5 shrink-0" />
          <span>{t('report.details.privacy')}</span>
        </Notice>

        {submitError && <p role="alert" className="font-medium text-danger-700">{submitError}</p>}
      </form>
    </CitizenShell>
  );
}
