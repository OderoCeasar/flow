import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { api } from '../../lib/api';
import type { Report } from '../../lib/types';
import { useReportActions } from './useReportActions';

interface Tech {
  id: string;
  name: string;
}

export function AssignDialog({ report, onClose }: { report: Report | undefined; onClose: () => void }) {
  const { t } = useTranslation();
  const techs = useQuery({ queryKey: ['technicians'], queryFn: () => api<{ items: Tech[] }>('/utility/technicians'), staleTime: 5 * 60_000 });
  const { assign } = useReportActions();
  const { register, handleSubmit, formState, reset } = useForm<{ technician_id: string; due: string }>({
    resolver: zodResolver(z.object({ technician_id: z.string().min(1, t('assign.pick')), due: z.string() })),
    values: { technician_id: report?.assignee_id ?? '', due: '' },
  });
  const close = () => {
    reset();
    onClose();
  };
  const submit = handleSubmit((v) => {
    if (!report) return;
    const name = techs.data?.items.find((x) => x.id === v.technician_id)?.name ?? '';
    assign.mutate(
      { id: report.id, technician_id: v.technician_id, due_at: v.due ? new Date(v.due).toISOString() : undefined, name },
      { onSuccess: close },
    );
  });
  return (
    <Dialog
      open={!!report}
      onClose={close}
      title={t('assign.title', { ref: report?.reference_code })}
      footer={
        <>
          <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
          <Button onClick={() => void submit()} loading={assign.isPending}>{t('assign.confirm')}</Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t('assign.technician')} error={formState.errors.technician_id?.message}>
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} invalid={invalid} {...register('technician_id')} autoFocus>
              <option value="">{techs.isLoading ? t('app.loading') : t('assign.choose')}</option>
              {techs.data?.items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t('assign.due')} hint={t('assign.dueHint')} optional>
          {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} type="datetime-local" {...register('due')} />}
        </Field>
        <p className="text-sm text-ink-muted">{t('assign.note')}</p>
      </form>
    </Dialog>
  );
}
