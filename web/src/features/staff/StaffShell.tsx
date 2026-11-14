import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router-dom';
import { LanguageSwitcher, OfflineBanner } from '../../components/ui/Layout';
import { IconDrop } from '../../components/ui/Icons';
import { useAuth } from '../../lib/auth';

const navItem = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-touch items-center rounded px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus ${
    isActive ? 'bg-brand-600 text-ink-inverse' : 'text-ink-muted hover:bg-surface-muted'
  }`;

export function StaffShell({ children, wide = true }: { children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const links =
    user?.role === 'technician'
      ? [{ to: '/tech', label: t('nav.jobs') }]
      : [
          { to: '/dashboard', label: t('nav.reports'), end: true },
          { to: '/dashboard/stats', label: t('nav.stats') },
          ...(user?.role === 'admin' ? [{ to: '/admin', label: t('nav.admin') }] : []),
        ];
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-3">
        {t('app.skip')}
      </a>
      <OfflineBanner />
      <header className="sticky top-0 z-[1100] border-b border-surface-line bg-surface">
        <div className={`mx-auto flex flex-wrap items-center gap-3 px-4 py-2 ${wide ? '' : 'max-w-xl'}`}>
          <span className="flex items-center gap-2 font-bold text-brand-700">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <IconDrop size={20} />
            </span>
            Flow <span className="hidden font-normal text-ink-muted sm:inline">· {t(`roles.${user?.role ?? 'dispatcher'}`)}</span>
          </span>
          <nav aria-label={t('nav.label')} className="flex flex-1 gap-1">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={'end' in l ? l.end : false} className={navItem}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <LanguageSwitcher compact />
          <span className="hidden text-sm text-ink-muted md:inline">{user?.name}</span>
          <button
            type="button"
            className="min-h-touch rounded px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus"
            onClick={async () => {
              await signOut();
              nav('/staff/login');
            }}
          >
            {t('app.signOut')}
          </button>
        </div>
      </header>
      <main id="main" className={`flex flex-1 flex-col ${wide ? '' : 'mx-auto w-full max-w-xl px-4 py-4'}`}>
        {children}
      </main>
    </div>
  );
}
