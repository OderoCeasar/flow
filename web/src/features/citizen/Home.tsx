import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, ButtonLink } from '../../components/ui/Button';
import { CitizenShell, InstallPrompt } from '../../components/ui/Layout';
import { IconCamera, IconOffline } from '../../components/ui/Icons';
import { Notice } from '../../components/ui/States';
import { clearDraft, loadDraft, outbox } from '../../lib/drafts';
import { flushOutbox } from '../../lib/submit';

// Decorative water drop with soft rings, drawn inline so it costs no download.
function HeroDrop() {
  return (
    <svg viewBox="0 0 260 260" className="h-auto w-[min(250px,34dvh)] lg:w-[min(420px,60dvh)]" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="drop-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b5cad" />
          <stop offset="1" stopColor="#1a8cc4" />
        </linearGradient>
        <filter id="drop-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#0b5cad" floodOpacity="0.22" />
        </filter>
      </defs>
      <circle cx="130" cy="126" r="124" fill="none" stroke="#dcebf3" strokeWidth="1.5" />
      <circle cx="130" cy="126" r="97" fill="none" stroke="#c9e1ee" strokeWidth="1.5" />
      <ellipse cx="130" cy="218" rx="76" ry="12" fill="none" stroke="#a8d2e6" strokeWidth="2.5" />
      <path
        d="M130 58c33 0 58 22 58 58 0 40-24 73-58 73s-60-30-60-70c0-37 26-61 60-61z"
        fill="url(#drop-fill)"
        filter="url(#drop-shadow)"
      />
      <path d="M130 94c-12 16-20 28-20 39a20 20 0 0 0 40 0c0-11-8-23-20-39z" fill="none" stroke="#fff" strokeWidth="6" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  const { t } = useTranslation();
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

  const cta = (
    <>
      <ButtonLink to="/report" size="lg" block icon={<IconCamera />}>
        {t('home.report')}
      </ButtonLink>
      <p className="text-center text-sm text-ink-muted">{t('home.quick')}</p>
    </>
  );
  return (
    <CitizenShell padded={false} width="wide" bottom={cta} bottomOnDesktop={false}>
      <div className="flex flex-1 flex-col bg-gradient-to-b from-[#f4f9fc] to-surface lg:bg-gradient-to-r">
        <div className="mx-auto grid w-full max-w-6xl flex-1 lg:grid-cols-2 lg:items-center lg:gap-12 lg:px-8 lg:py-12">
          <div className="flex items-center justify-center px-5 pb-2 pt-8 lg:p-0">
            <HeroDrop />
          </div>
          <div className="flex flex-col">
            <section className="flex flex-col gap-3 px-7 pb-6 lg:px-0">
              <p className="text-sm font-bold tracking-wide text-brand-700">{t('home.eyebrow')}</p>
              <h1 className="text-[2rem] font-normal leading-[1.15] tracking-tight text-ink-heading lg:text-5xl lg:leading-[1.1]">
                {t('home.titleLine1')}
                <br />
                {t('home.titleLine2')}
              </h1>
              <p className="text-[17px] leading-relaxed text-ink-muted lg:max-w-md lg:text-xl">{t('home.lead')}</p>
              <div className="hidden max-w-sm flex-col gap-2 pt-4 lg:flex">{cta}</div>
              <Link to="/track" className="mt-1 self-start rounded text-[15px] font-semibold text-brand-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
                {t('home.trackLink')}
              </Link>
            </section>

            {(hasDraft || waiting > 0) && (
              <div className="flex flex-col gap-3 px-5 pb-5 lg:max-w-md lg:px-0">
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
              </div>
            )}
            <div className="px-5 pb-5 empty:hidden lg:max-w-md lg:px-0">
              <InstallPrompt />
            </div>
          </div>
        </div>
      </div>
    </CitizenShell>
  );
}
