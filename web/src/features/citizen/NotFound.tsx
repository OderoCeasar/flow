import { useTranslation } from 'react-i18next';
import { ButtonLink } from '../../components/ui/Button';
import { CitizenShell } from '../../components/ui/Layout';
import { EmptyState } from '../../components/ui/States';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <CitizenShell>
      <EmptyState title={t('notFound.title')} body={t('notFound.body')} action={<ButtonLink to="/">{t('notFound.home')}</ButtonLink>} />
    </CitizenShell>
  );
}
