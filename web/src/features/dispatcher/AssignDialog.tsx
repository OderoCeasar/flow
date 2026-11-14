import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, TextInput } from '../../components/ui/Field';
import { ListSkeleton } from '../../components/ui/States';
import { api } from '../../lib/api';
import { distance, initials } from '../../lib/format';
import type { Report, Technician } from '../../lib/types';
import { useReportActions } from './useReportActions';

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

export function AssignDialog({ report, onClose }: { report: Report | undefined; onClose: () => void }) {
  const { t } = useTranslation();
  const techs = useQuery({
    queryKey: ['technicians', report?.id],
    queryFn: () => api<{ items: Technician[] }>(`/utility/technicians?report_id=${report!.id}`),
    enabled: !!report,
  });
  const { assign } = useReportActions();
  const { register, handleSubmit, formState, reset, watch } = useForm<{ technician_id: string; due: string }>({
    resolver: zodResolver(z.object({ technician_id: z.string().min(1, t('assign.pick')), due: z.string() })),
    values: { technician_id: report?.assignee_id ?? '', due: tomorrow() },
  });
  const chosen = watch('technician_id');
  const close = () => {
    reset();
    onClose();
  };
  const submit = handleSubmit((v) => {
    if (!report) return;
    const name = techs.data?.items.find((x) => x.id === v.technician_id)?.name ?? '';
    // A due date means "by the end of the working day".
    const due = v.due ? new Date(`${v.due}T17:00:00`).toISOString() : undefined;
    assign.mutate({ id: report.id, technician_id: v.technician_id, due_at: due, name }, { onSuccess: close });
  });
  return (
    <Dialog
      open={!!report}
      onClose={close}
      title={t('assign.title')}
      eyebrow={t('assign.eyebrow', { ref: report?.reference_code })}
      footer={
        <>
          <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
          <Button size="lg" onClick={() => void submit()} loading={assign.isPending}>{t('assign.confirm')}</Button>
        </>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={(e) => void submit(e)}>
        <fieldset>
          <legend className="sr-only">{t('assign.technician')}</legend>
          {techs.isLoading && <ListSkeleton rows={3} />}
          {techs.data && techs.data.items.length === 0 && <p className="text-ink-muted">{t('assign.none')}</p>}
          <div className="flex flex-col gap-2">
            {techs.data?.items.map((x, i) => {
              const checked = chosen === x.id;
              return (
                <label key={x.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus ${
                    checked ? 'border-brand-500 bg-brand-50/60' : 'border-surface-line hover:border-brand-300'}`}>
                  <input type="radio" value={x.id} className="h-5 w-5 accent-brand-600" autoFocus={i === 0} {...register('technician_id')} />
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#d5efe9] text-sm font-bold text-accent-800" aria-hidden="true">
                    {initials(x.name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold text-ink">{x.name}</span>
                    <span className="text-sm text-ink-muted">{t('assign.openJobs', { count: x.open_jobs })}</span>
                  </span>
                  <span className="text-right text-sm font-semibold text-ink">
                    {x.nearest_job_m != null ? distance(x.nearest_job_m) : '—'}
                    <span className="block text-[11px] font-normal text-ink-muted">{x.nearest_job_m != null ? t('assign.fromNearestJob') : t('assign.noNearbyJob')}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {formState.errors.technician_id && <p role="alert" className="mt-2 text-sm font-medium text-danger-700">{formState.errors.technician_id.message}</p>}
        </fieldset>
        <Field label={t('assign.due')} hint={t('assign.dueHint')}>
          {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} type="date" min={new Date().toLocaleDateString('en-CA')} {...register('due')} />}
        </Field>
      </form>
    </Dialog>
  );
}
