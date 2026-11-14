import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { ButtonLink, Button } from '../../../components/ui/Button';
import { CitizenShell } from '../../../components/ui/Layout';
import { IconCheck, IconCopy, IconOffline } from '../../../components/ui/Icons';
import { Notice } from '../../../components/ui/States';
import { Timeline } from '../../../components/ui/Timeline';
import { duration } from '../../../lib/format';
import type { CreateReportResult } from '../../../lib/types';
import { useFlow } from './ReportFlow';

export default function Done() {
  const { t } = useTranslation();
  const { state } = useLocation() as { state: (CreateReportResult & { offline?: undefined }) | { offline: true } | null };
  const [copied, setCopied] = useState(false);
  const { reset } = useFlow();
  // The report is sent (or queued), so the draft is no longer needed.
  useEffect(() => {
    if (state) reset();
  }, [state, reset]);
  if (!state) return <Navigate to="/" replace />;

  if ('offline' in state && state.offline) {
    return (
      <CitizenShell bottom={<ButtonLink to="/" size="lg" block>{t('report.done.home')}</ButtonLink>}>
        <div className="flex flex-col items-center gap-3 pt-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-warning-50 text-warning-800">
            <IconOffline size={32} />
          </span>
          <h1 className="text-2xl font-bold">{t('report.done.offlineTitle')}</h1>
          <p className="text-ink-muted">{t('report.done.offlineBody')}</p>
        </div>
      </CitizenShell>
    );
  }

  const res = state as CreateReportResult;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(res.reference_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard blocked; the code is on screen to write down
    }
  };
  return (
    <CitizenShell
      bottom={
        <>
          <ButtonLink to={`/track/${res.reference_code}`} size="lg" block>
            {t('report.done.track')}
          </ButtonLink>
          <ButtonLink to="/report" variant="ghost" block>
            {t('report.done.another')}
          </ButtonLink>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-50 text-success-700">
          <IconCheck size={36} strokeWidth={3} />
        </span>
        <h1 className="text-2xl font-bold">{res.joined_existing ? t('report.done.joinedTitle') : t('report.done.title')}</h1>
        <p className="text-ink-muted">{res.joined_existing ? t('report.done.joinedBody') : t('report.done.body')}</p>
      </div>

      <div className="flex flex-col items-center gap-2 rounded-xl bg-surface p-5">
        <p className="text-sm font-semibold text-ink-muted">{t('report.done.ref')}</p>
        <p className="font-mono text-3xl font-bold tracking-wider" data-testid="reference-code">
          {res.reference_code}
        </p>
        <Button variant="ghost" onClick={() => void copy()} icon={copied ? <IconCheck size={18} /> : <IconCopy size={18} />}>
          <span aria-live="polite">{copied ? t('report.done.copied') : t('report.done.copy')}</span>
        </Button>
      </div>

      <Notice tone={res.sms_updates ? 'success' : 'info'}>{res.sms_updates ? t('report.done.sms') : t('report.done.noSms')}</Notice>

      <section className="rounded-xl bg-surface p-5">
        <h2 className="mb-1 font-semibold">{t('track.whatNext')}</h2>
        <p className="mb-4 text-sm text-ink-muted">{t('report.done.typical', { time: duration(res.typical_fix_hours, t) })}</p>
        <Timeline status={res.status} events={[{ status: 'received', created_at: new Date().toISOString() }]} />
      </section>
    </CitizenShell>
  );
}
