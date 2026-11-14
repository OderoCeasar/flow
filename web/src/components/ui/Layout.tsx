import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LANGUAGES } from '../../i18n';
import { useInstallPrompt } from '../../lib/install';
import { IconArrowLeft, IconCheck, IconDownload, IconDrop, IconMore, IconOffline } from './Icons';

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

// A small "Add Flow to your home screen" card, shown only when the browser offers it.
export function InstallPrompt() {
  const { t } = useTranslation();
  const { available, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('flow.installDismissed') === '1';
    } catch {
      return false;
    }
  });
  if (!available || dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('flow.installDismissed', '1');
    } catch {
      // ignore
    }
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 p-3">
      <IconDownload className="shrink-0 text-brand-700" />
      <p className="flex-1 text-sm text-brand-900">{t('app.installHint')}</p>
      <button type="button" onClick={() => void install()}
        className="min-h-touch rounded px-3 font-semibold text-brand-700 hover:bg-brand-100 focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
        {t('app.install')}
      </button>
      <button type="button" onClick={dismiss}
        className="min-h-touch rounded px-2 text-sm text-ink-muted hover:bg-brand-100 focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus">
        {t('app.installDismiss')}
      </button>
    </div>
  );
}

const menuItem =
  'flex min-h-touch w-full items-center gap-2 rounded-lg px-3 text-left text-[15px] text-ink hover:bg-surface-muted ' +
  'focus-visible:outline focus-visible:outline-3 focus-visible:-outline-offset-2 focus-visible:outline-focus';

// The "⋯" menu: other pages, language and install. A simple disclosure (not an
// ARIA menu), so Tab and Enter work the way people expect.
export function MoreMenu() {
  const { t, i18n } = useTranslation();
  const { available, install } = useInstallPrompt();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={t('app.menu')}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-touch min-w-touch items-center justify-center rounded-full text-ink hover:bg-surface-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus"
      >
        <IconMore />
      </button>
      {open && (
        <div id={id} className="absolute right-0 top-[calc(100%+4px)] z-50 w-64 rounded-xl border border-surface-line bg-surface p-2 shadow-lg">
          <nav aria-label={t('app.menu')}>
            <ul className="flex flex-col">
              <li><Link to="/report" className={menuItem} onClick={close}>{t('menu.report')}</Link></li>
              <li><Link to="/track" className={menuItem} onClick={close}>{t('menu.track')}</Link></li>
              <li><Link to="/my-reports" className={menuItem} onClick={close}>{t('menu.myReports')}</Link></li>
            </ul>
          </nav>
          <div role="group" aria-labelledby={`${id}-lang`} className="mt-1 border-t border-surface-line pt-2">
            <p id={`${id}-lang`} className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('app.language')}</p>
            {LANGUAGES.map((l) => (
              <button key={l.code} type="button" lang={l.code} aria-pressed={i18n.language === l.code} className={menuItem}
                onClick={() => {
                  void i18n.changeLanguage(l.code);
                  close();
                }}>
                <span className="flex-1">{l.label}</span>
                {i18n.language === l.code && <IconCheck size={18} className="text-brand-700" />}
              </button>
            ))}
          </div>
          <div className="mt-1 border-t border-surface-line pt-1">
            {available && (
              <button type="button" className={menuItem} onClick={() => void install().then(close)}>
                <IconDownload size={18} className="text-brand-700" />
                {t('app.installApp')}
              </button>
            )}
            <Link to="/staff/login" className={`${menuItem} text-sm text-ink-muted`} onClick={close}>{t('menu.staff')}</Link>
          </div>
        </div>
      )}
    </div>
  );
}

// CitizenShell is the phone-shaped layout for every citizen screen.
// Phones: full screen, the page scrolls, and the main action stays pinned at
// the bottom within thumb reach. Wider screens: the same layout in a centred
// phone frame that scrolls inside, so the app looks the same everywhere.
export function CitizenShell({
  title,
  back,
  children,
  bottom,
  padded = true,
}: {
  title?: string;
  back?: { to: string; label: string } | { onClick: () => void; label: string };
  children: ReactNode;
  bottom?: ReactNode;
  padded?: boolean;
}) {
  const { t } = useTranslation();
  const iconButton =
    '-ml-2 flex min-h-touch min-w-touch items-center justify-center rounded-full text-ink hover:bg-surface-muted ' +
    'focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus';
  return (
    <div className="min-h-dvh bg-canvas sm:flex sm:items-center sm:justify-center sm:p-6">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-3">
        {t('app.skip')}
      </a>
      <div className="mx-auto flex min-h-dvh w-full flex-col bg-surface sm:h-[min(880px,calc(100dvh-3rem))] sm:min-h-0 sm:max-w-[400px] sm:overflow-hidden sm:rounded-[28px] sm:shadow-[0_24px_60px_-20px_rgba(15,44,74,0.25)] sm:ring-1 sm:ring-black/5">
        <OfflineBanner />
        <header className="sticky top-0 z-[1100] border-b border-surface-sunken bg-surface/95 backdrop-blur sm:static">
          <div className="grid min-h-[64px] grid-cols-[auto_1fr_auto] items-center gap-2 px-4">
            {back ? (
              'to' in back ? (
                <Link to={back.to} className={iconButton} aria-label={back.label}>
                  <IconArrowLeft />
                </Link>
              ) : (
                <button type="button" onClick={back.onClick} className={iconButton} aria-label={back.label}>
                  <IconArrowLeft />
                </button>
              )
            ) : (
              <Link to="/" className="flex min-h-touch items-center gap-2.5 rounded text-xl font-bold text-brand-700 focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus" aria-label={t('app.home')}>
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-600 text-white">
                  <IconDrop size={20} />
                </span>
                <span aria-hidden="true">Flow</span>
              </Link>
            )}
            {title ? <h1 className="truncate text-center text-base font-semibold text-ink">{title}</h1> : <span />}
            <MoreMenu />
          </div>
        </header>
        <main id="main" className={`flex flex-1 flex-col sm:overflow-y-auto ${padded ? 'gap-5 px-5 py-6' : ''}`}>
          {children}
        </main>
        {bottom && (
          <div className="sticky bottom-0 z-[1100] border-t border-surface-sunken bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:static">
            <div className="flex flex-col gap-2 px-5 py-4">{bottom}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// The step heading used across the citizen screens: regular weight, navy.
export function PageHeading({ title, lead, as: Tag = 'h1' }: { title: string; lead?: string; as?: 'h1' | 'h2' }) {
  return (
    <div className="flex flex-col gap-2">
      <Tag className="text-2xl font-normal leading-tight tracking-tight text-ink-heading">{title}</Tag>
      {lead && <p className="text-[17px] leading-relaxed text-ink-muted">{lead}</p>}
    </div>
  );
}
