import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { CitizenShell } from '../../components/ui/Layout';
import { Notice } from '../../components/ui/States';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useErrorMessage } from '../../lib/useErrorMessage';

export default function SignIn() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const errorMessage = useErrorMessage();
  const [phone, setPhone] = useState<string | null>(null);
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');

  const phoneForm = useForm<{ phone: string }>({
    resolver: zodResolver(z.object({ phone: z.string().regex(/^(?:\+?254|0)?[17]\d{8}$/, t('report.details.phoneInvalid')) })),
    defaultValues: { phone: '' },
  });
  const codeForm = useForm<{ code: string }>({
    resolver: zodResolver(z.object({ code: z.string().regex(/^\d{6}$/, t('signIn.codeInvalid')) })),
    defaultValues: { code: '' },
  });

  const requestCode = phoneForm.handleSubmit(async ({ phone: raw }) => {
    setError('');
    try {
      const res = await api<{ phone: string; dev_code?: string }>('/auth/otp/request', {
        method: 'POST',
        json: { phone: raw.replace(/[\s-]/g, ''), locale: i18n.language },
      });
      setPhone(res.phone);
      setDevCode(res.dev_code ?? '');
    } catch (e) {
      if (e instanceof ApiError && e.fields.phone) phoneForm.setError('phone', { message: e.fields.phone });
      else setError(errorMessage(e));
    }
  });

  const verify = codeForm.handleSubmit(async ({ code }) => {
    setError('');
    try {
      await api('/auth/otp/verify', { method: 'POST', json: { phone, code } });
      await refresh();
      nav(params.get('next') ?? '/my-reports', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.fields.code) codeForm.setError('code', { message: e.fields.code });
      else setError(errorMessage(e));
    }
  });

  return (
    <CitizenShell title={t('signIn.title')} back={{ to: '/', label: t('app.back') }}>
      <p className="text-ink-muted">{t('signIn.lead')}</p>
      {!phone ? (
        <form className="flex flex-col gap-4" onSubmit={(e) => void requestCode(e)} noValidate>
          <Field label={t('signIn.phone')} hint={t('signIn.phoneHint')} error={phoneForm.formState.errors.phone?.message}>
            {({ id, describedBy, invalid }) => (
              <TextInput id={id} aria-describedby={describedBy} invalid={invalid} type="tel" inputMode="tel" autoComplete="tel"
                placeholder="0712 345 678" {...phoneForm.register('phone')} />
            )}
          </Field>
          <Button type="submit" size="lg" loading={phoneForm.formState.isSubmitting}>
            {t('signIn.send')}
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(e) => void verify(e)} noValidate>
          <Notice tone="success">{t('signIn.codeSent', { phone })}</Notice>
          {devCode && <Notice>{t('signIn.devCode', { code: devCode })}</Notice>}
          <Field label={t('signIn.code')} error={codeForm.formState.errors.code?.message}>
            {({ id, describedBy, invalid }) => (
              <TextInput id={id} aria-describedby={describedBy} invalid={invalid} inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} className="font-mono text-2xl tracking-[0.4em]" {...codeForm.register('code')} />
            )}
          </Field>
          <Button type="submit" size="lg" loading={codeForm.formState.isSubmitting}>
            {t('signIn.verify')}
          </Button>
          <Button variant="ghost" onClick={() => { setPhone(null); codeForm.reset(); }}>
            {t('signIn.change')}
          </Button>
        </form>
      )}
      {error && <p role="alert" className="font-medium text-danger-700">{error}</p>}
    </CitizenShell>
  );
}
