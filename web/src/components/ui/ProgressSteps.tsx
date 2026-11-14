import { useTranslation } from 'react-i18next';

// "Step 2 of 3" with one continuous bar, announced to screen readers.
export function ProgressSteps({ step, total, labels }: { step: number; total: number; labels: string[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-brand-700">
        {t('report.stepOf', { step, total })}
        <span className="sr-only">: {labels[step - 1]}</span>
      </p>
      <div
        className="h-1 overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-label={t('report.progressLabel')}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-valuetext={t('report.stepOf', { step, total })}
      >
        <div className="h-full rounded-full bg-accent-600 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(step / total) * 100}%` }} />
      </div>
    </div>
  );
}
