import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LANGUAGES } from '../../i18n';
import { IconArrowLeft, IconDownload, IconDrop, IconOffline } from './Icons';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t('app.language')} className="flex rounded border border-surface-line bg-surface p-0.5">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          aria-pressed={i18n.language === l.code}
          onClick={() => void i18n.changeLanguage(l.code)}
          className={`min-h-[40px] rounded px-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus ${
            i18n.language === l.code ? 'bg-brand-600 text-ink-inverse' : 'text-ink-muted hover:bg-surface-muted'
          }`}
        >
          {compact ? l.code.toUpperCase() : l.label}
        </button>
      ))}
    </div>
  );
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-ink px-4 py-2 text-sm text-ink-inverse">
      <IconOffline size={18} />
      {t('app.offline')}
    </div>
  );
}

// Offers "Add to home screen" where the browser supports the install prompt.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const { t } = useTranslation();
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('flow.installDismissed') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  if (!event || dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('flow.installDismissed', '1');
    } catch {
      // ignore
    }
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
      <IconDownload className="shrink-0 text-brand-700" />
      <p className="flex-1 text-sm text-brand-900">{t('app.installHint')}</p>
      <button
        type="button"
        className="min-h-touch rounded px-3 font-semibold text-brand-700 hover:bg-brand-100 focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus"
        onClick={async () => {
          await event.prompt();
          await event.userChoice;
          setEvent(null);
        }}
      >
        {t('app.install')}
      </button>
      <button
        type="button"
        className="min-h-touch rounded px-2 text-sm text-ink-muted hover:bg-brand-100 focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus"
        onClick={dismiss}
      >
        {t('app.installDismiss')}
      </button>
    </div>
  );
}

// CitizenShell: one column, sized for a small phone, with the main action in
// a sticky bar at the bottom (thumb reach).
export function CitizenShell({
  title,
  back,
  children,
  bottom,
}: {
  title?: string;
  back?: { to: string; label: string } | { onClick: () => void; label: string };
  children: ReactNode;
  bottom?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-3">
        {t('app.skip')}
      </a>
      <OfflineBanner />
      <header className="sticky top-0 z-20 border-b border-surface-line bg-surface">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-2">
          {back ? (
            'to' in back ? (
              <Link
                to={back.to}
                className="-ml-2 flex min-h-touch min-w-touch items-center justify-center rounded text-ink hover:bg-surface-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus"
                aria-label={back.label}
              >
                <IconArrowLeft />
              </Link>
            ) : (
              <button
                type="button"
                onClick={back.onClick}
                className="-ml-2 flex min-h-touch min-w-touch items-center justify-center rounded text-ink hover:bg-surface-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus"
                aria-label={back.label}
              >
                <IconArrowLeft />
              </button>
            )
          ) : (
            <Link to="/" className="flex min-h-touch items-center gap-2 font-bold text-brand-700" aria-label={t('app.home')}>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                <IconDrop size={20} />
              </span>
              <span>Flow</span>
            </Link>
          )}
          {title && <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>}
          {!title && <span className="flex-1" />}
          <LanguageSwitcher compact />
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pb-32 pt-5">
        {children}
      </main>
      {bottom && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-xl flex-col gap-2 px-4 py-3">{bottom}</div>
        </div>
      )}
    </div>
  );
}
