import { useQueries, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, ButtonLink } from '../../components/ui/Button';
import { LeakTypeLabel, StatusBadge } from '../../components/ui/Badges';
import { CitizenShell } from '../../components/ui/Layout';
import { IconCamera } from '../../components/ui/Icons';
import { EmptyState, ErrorState, ListSkeleton } from '../../components/ui/States';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { rememberedRefs } from '../../lib/drafts';
import { timeAgo } from '../../lib/format';
import type { PublicStatus } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';

function ReportList({ items }: { items: PublicStatus[] }) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col gap-2">
      {items.map((r) => (
        <li key={r.reference_code}>
          <Link
            to={`/track/${r.reference_code}`}
            className="flex min-h-touch items-center gap-3 rounded-xl bg-surface p-4 hover:bg-brand-50 focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus"
          >
            <div className="flex flex-1 flex-col gap-1">
              <span className="font-mono font-bold">{r.reference_code}</span>
              <span className="text-sm text-ink-muted">
                <LeakTypeLabel type={r.leak_type} /> · {timeAgo(r.created_at, t)}
              </span>
            </div>
            <StatusBadge status={r.status} size="sm" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function MyReports() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { user, signOut } = useAuth();
  const signedIn = user?.role === 'citizen';

  const mine = useQuery({
    queryKey: ['my-reports'],
    queryFn: () => api<{ items: PublicStatus[] }>('/me/reports'),
    enabled: signedIn,
  });
  // Without an account, show reports sent from this device.
  const local = useQueries({
    queries: (signedIn ? [] : rememberedRefs()).map((ref) => ({
      queryKey: ['track', ref],
      queryFn: () => api<PublicStatus>(`/reports/${ref}`),
    })),
  });
  const localItems = local.map((q) => q.data).filter((x): x is PublicStatus => !!x).reverse();

  return (
    <CitizenShell title={t('myReports.title')} back={{ to: '/', label: t('app.back') }}>
      {signedIn ? (
        <>
          <p className="text-sm text-ink-muted">{t('myReports.signedInAs', { phone: user?.phone })}</p>
          {mine.isLoading && <ListSkeleton rows={3} />}
          {mine.isError && <ErrorState message={errorMessage(mine.error)} onRetry={() => void mine.refetch()} />}
          {mine.data &&
            (mine.data.items.length ? (
              <ReportList items={mine.data.items} />
            ) : (
              <EmptyState
                title={t('myReports.empty')}
                body={t('myReports.emptyBody')}
                icon={<IconCamera size={36} />}
                action={<ButtonLink to="/report">{t('home.report')}</ButtonLink>}
              />
            ))}
          <Button variant="ghost" onClick={() => void signOut()}>
            {t('app.signOut')}
          </Button>
        </>
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-xl bg-surface p-4">
            <p>{t('myReports.signedOutLead')}</p>
            <ButtonLink to="/signin?next=/my-reports">{t('myReports.signIn')}</ButtonLink>
          </section>
          <h2 className="font-semibold">{t('myReports.onThisDevice')}</h2>
          {local.some((q) => q.isLoading) && <ListSkeleton rows={2} />}
          {localItems.length ? (
            <ReportList items={localItems} />
          ) : (
            !local.some((q) => q.isLoading) && (
              <EmptyState
                title={t('myReports.empty')}
                body={t('myReports.emptyBody')}
                icon={<IconCamera size={36} />}
                action={<ButtonLink to="/report">{t('home.report')}</ButtonLink>}
              />
            )
          )}
        </>
      )}
    </CitizenShell>
  );
}
