import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { CitizenShell } from '../../components/ui/Layout';
import { api } from '../../lib/api';
import { homeFor, useAuth } from '../../lib/auth';
import type { User } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';

export default function StaffLogin() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user, refresh } = useAuth();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState } = useForm<{ email: string; password: string }>({
    resolver: zodResolver(
      z.object({ email: z.string().email(t('staff.emailInvalid')), password: z.string().min(1, t('staff.passwordRequired')) }),
    ),
  });

  if (user && user.role !== 'citizen') return <Navigate to={homeFor(user.role)} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setError('');
    try {
      const res = await api<{ user: User }>('/auth/login', { method: 'POST', json: values });
      await refresh();
      nav(params.get('next') ?? homeFor(res.user.role), { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <CitizenShell title={t('staff.loginTitle')} back={{ to: '/', label: t('app.back') }}>
      <p className="text-ink-muted">{t('staff.loginLead')}</p>
      <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)} noValidate>
        <Field label={t('staff.email')} error={formState.errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <TextInput id={id} aria-describedby={describedBy} invalid={invalid} type="email" autoComplete="username" {...register('email')} />
          )}
        </Field>
        <Field label={t('staff.password')} error={formState.errors.password?.message}>
          {({ id, describedBy, invalid }) => (
            <TextInput id={id} aria-describedby={describedBy} invalid={invalid} type="password" autoComplete="current-password" {...register('password')} />
          )}
        </Field>
        {error && <p role="alert" className="font-medium text-danger-700">{error}</p>}
        <Button type="submit" size="lg" loading={formState.isSubmitting}>
          {t('staff.signIn')}
        </Button>
      </form>
    </CitizenShell>
  );
}
