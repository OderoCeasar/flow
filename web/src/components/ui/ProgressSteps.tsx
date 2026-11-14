import { useTranslation } from 'react-i18next';

// "Step 2 of 3" in words and as a bar, announced to screen readers.
export function ProgressSteps({ step, total, labels }: { step: number; total: number; labels: string[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-ink-muted">
        {t('report.stepOf', { step, total })}
        <span className="text-ink"> · {labels[step - 1]}</span>
      </p>
      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-label={t('report.progressLabel')}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-valuetext={t('report.stepOf', { step, total })}
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-brand-600' : 'bg-surface-sunken'}`} />
        ))}
      </div>
    </div>
  );
}
