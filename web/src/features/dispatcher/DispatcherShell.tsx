import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router-dom';
import { IconChart, IconCheck, IconDrop, IconKeyboard, IconList, IconMap, IconSettings, IconUsers } from '../../components/ui/Icons';
import { OfflineBanner } from '../../components/ui/Layout';
import { LANGUAGES } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { initials } from '../../lib/format';

export const SHORTCUTS_EVENT = 'flow:shortcuts';

function useNavItems() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return [
    { to: '/dashboard', label: t('nav.reports'), icon: IconList, end: true },
    { to: '/dashboard/map', label: t('nav.map'), icon: IconMap },
    { to: '/dashboard/crews', label: t('nav.crews'), icon: IconUsers },
    { to: '/dashboard/stats', label: t('nav.stats'), icon: IconChart },
    ...(user?.role === 'admin' ? [{ to: '/admin', label: t('nav.settings'), icon: IconSettings }] : []),
  ];
}

// The avatar opens a small menu: who you are, language, shortcuts, sign out.
export function AccountMenu({ align = 'right', tone = 'light' }: { align?: 'right' | 'up'; tone?: 'light' | 'dark' }) {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  const item =
    'flex min-h-touch w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-ink hover:bg-surface-muted focus-visible:outline focus-visible:outline-3 focus-visible:-outline-offset-2 focus-visible:outline-focus';
  return (
    <div ref={ref} className="relative">
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus ${
          tone === 'dark' ? 'bg-[#d5efe9] text-accent-800 ring-2 ring-white/30' : 'bg-[#d5efe9] text-accent-800'
        }`}
      >
        <span aria-hidden="true">{initials(user?.name ?? '')}</span>
        <span className="sr-only">{t('account.menu', { name: user?.name })}</span>
      </button>
      {open && (
        <div id={id} className={`absolute z-[1500] w-64 rounded-xl border border-surface-line bg-surface p-2 text-ink shadow-lg ${
          align === 'up' ? 'bottom-0 left-[calc(100%+12px)]' : 'right-0 top-[calc(100%+6px)]'}`}>
          <div className="px-3 py-2">
            <p className="font-semibold">{user?.name}</p>
            <p className="text-sm text-ink-muted">{t(`roles.${user?.role ?? 'dispatcher'}`)}</p>
          </div>
          <div role="group" aria-label={t('app.language')} className="border-t border-surface-line pt-1">
            {LANGUAGES.map((l) => (
              <button key={l.code} type="button" lang={l.code} aria-pressed={i18n.language === l.code} className={item}
                onClick={() => void i18n.changeLanguage(l.code)}>
                <span className="flex-1">{l.label}</span>
                {i18n.language === l.code && <IconCheck size={16} className="text-brand-700" />}
              </button>
            ))}
          </div>
          <div className="border-t border-surface-line pt-1">
            <button type="button" className={item} onClick={() => { setOpen(false); window.dispatchEvent(new Event(SHORTCUTS_EVENT)); }}>
              <IconKeyboard size={18} className="text-ink-muted" /> {t('dashboard.shortcuts')}
            </button>
            <button type="button" className={item} onClick={async () => { await signOut(); nav('/staff/login'); }}>
              {t('app.signOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// DispatcherShell: navy sidebar on tablets and up, a bottom tab bar on phones,
// and a page header with the date and a greeting.
export function DispatcherShell({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const items = useNavItems();
  const now = new Date();
  const hour = now.getHours();
  const greeting = t(hour < 12 ? 'greeting.morning' : hour < 17 ? 'greeting.afternoon' : 'greeting.evening', {
    name: user?.name.split(' ')[0] ?? '',
  });
  const date = now.toLocaleDateString(i18n.language === 'sw' ? 'sw-KE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className="flex min-h-dvh bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[2000] focus:rounded focus:bg-surface focus:p-3">
        {t('app.skip')}
      </a>
      <aside className="sticky top-0 hidden h-dvh w-[92px] shrink-0 flex-col items-center bg-sidebar py-5 text-white md:flex">
        <span className="mb-8 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-600" aria-hidden="true">
          <IconDrop size={24} />
        </span>
        <nav aria-label={t('nav.label')} className="flex w-full flex-1 flex-col items-center gap-2 px-3">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={'end' in it ? it.end : false}
              className={({ isActive }) =>
                `flex w-full flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-medium focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus ${
                  isActive ? 'bg-sidebar-active text-white' : 'text-white/85 hover:bg-white/10'}`}>
              <it.icon size={22} />
              {it.label}
            </NavLink>
          ))}
        </nav>
        <AccountMenu align="up" tone="dark" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-[72px] md:pb-0">
        <OfflineBanner />
        <header className="flex flex-wrap items-center gap-3 px-4 pb-4 pt-5 sm:px-7 sm:pt-7">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink-muted">{date}</p>
            <h1 className="text-xl font-normal tracking-tight text-ink-heading sm:text-[1.65rem]">{title ?? greeting}</h1>
          </div>
          {actions}
          <AccountMenu />
        </header>
        <main id="main" className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-7">
          {children}
        </main>
      </div>

      <nav aria-label={t('nav.label')} className="fixed inset-x-0 bottom-0 z-[1200] flex border-t border-white/10 bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={'end' in it ? it.end : false}
            className={({ isActive }) =>
              `flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium focus-visible:outline focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-focus ${
                isActive ? 'bg-sidebar-active text-white' : 'text-white/85'}`}>
            <it.icon size={20} />
            {it.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
