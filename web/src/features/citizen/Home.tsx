import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { CitizenShell, InstallPrompt } from '../../components/ui/Layout';
import { IconCamera, IconOffline, IconUser } from '../../components/ui/Icons';
import { Notice } from '../../components/ui/States';
import { clearDraft, loadDraft, outbox } from '../../lib/drafts';
import { flushOutbox } from '../../lib/submit';
import { useAuth } from '../../lib/auth';

export default function Home() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { user } = useAuth();
  const [ref, setRef] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const [waiting, setWaiting] = useState(0);

  // Fetch the report flow in the background so "Report a leak" opens instantly.
  useEffect(() => {
    void import('./report/ReportFlow');
  }, []);

  useEffect(() => {
    void loadDraft().then((d) => setHasDraft(!!d && (!!d.photo || d.lat != null) && Date.now() - d.updatedAt < 24 * 3600 * 1000));
    void outbox().then((o) => setWaiting(o.length));
  }, []);

  return (
    <CitizenShell bottom={<ButtonLink to="/report" size="lg" block icon={<IconCamera />}>{t('home.report')}</ButtonLink>}>
      <section className="flex flex-col gap-2 pt-2">
        <h1 className="text-3xl font-bold leading-tight">{t('home.title')}</h1>
        <p className="text-lg text-ink-muted">{t('home.lead')}</p>
      </section>

      {hasDraft && (
        <Notice>
          <div className="flex flex-1 flex-col gap-2">
            <span className="font-medium">{t('home.draft')}</span>
            <div className="flex gap-2">
              <ButtonLink to="/report" size="sm">{t('home.draftContinue')}</ButtonLink>
              <Button size="sm" variant="ghost" onClick={() => void clearDraft().then(() => setHasDraft(false))}>
                {t('home.draftDiscard')}
              </Button>
            </div>
          </div>
        </Notice>
      )}

      {waiting > 0 && (
        <Notice tone="warning">
          <IconOffline size={18} className="mt-0.5 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <span>{t('home.waiting', { count: waiting })}</span>
            <Button size="sm" variant="secondary" onClick={() => void flushOutbox().then(() => outbox()).then((o) => setWaiting(o.length))}>
              {t('home.sendNow')}
            </Button>
          </div>
        </Notice>
      )}

      <ol className="grid gap-3 rounded-xl bg-surface p-4" aria-label={t('home.howItWorks')}>
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">{n}</span>
            <span className="pt-1">{t(`home.step${n}`)}</span>
          </li>
        ))}
      </ol>

      <InstallPrompt />

      <form
        className="flex flex-col gap-3 rounded-xl bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ref.trim()) nav(`/track/${ref.trim().toUpperCase()}`);
        }}
      >
        <Field label={t('home.trackLabel')} hint={t('home.trackHint')}>
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="FLW-7K3QPX"
              autoCapitalize="characters"
              autoComplete="off"
            />
          )}
        </Field>
        <Button type="submit" variant="secondary" disabled={!ref.trim()}>
          {t('home.trackButton')}
        </Button>
      </form>

      <nav className="flex flex-col gap-2" aria-label={t('home.more')}>
        <ButtonLink to="/my-reports" variant="ghost" icon={<IconUser size={20} />}>
          {user?.role === 'citizen' ? t('home.myReports') : t('home.myReportsSignedOut')}
        </ButtonLink>
        <ButtonLink to="/staff/login" variant="ghost" size="sm" className="text-ink-muted">
          {t('home.staff')}
        </ButtonLink>
      </nav>
    </CitizenShell>
  );
}
