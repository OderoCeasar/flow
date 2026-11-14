import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Select, TextArea, TextInput } from '../../components/ui/Field';
import { IconInfo } from '../../components/ui/Icons';
import { Notice } from '../../components/ui/States';
import { SEVERITIES } from '../../lib/types';

export function InvalidDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
  const { t } = useTranslation();
  const { register, handleSubmit, formState, reset } = useForm<{ note: string }>({
    resolver: zodResolver(z.object({ note: z.string().trim().min(3, t('detail.reasonRequired')).max(500) })),
  });
  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} title={t('detail.invalidTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => void handleSubmit((v) => { onConfirm(v.note); reset(); })()}>{t('detail.markInvalid')}</Button>
        </>
      }>
      <div className="flex flex-col gap-3">
        <Notice tone="warning"><IconInfo size={18} className="mt-0.5 shrink-0" /><span>{t('detail.invalidBody')}</span></Notice>
        <Field label={t('detail.reasonForCitizen')} error={formState.errors.note?.message}>
          {({ id, describedBy, invalid }) => <TextArea id={id} aria-describedby={describedBy} invalid={invalid} rows={3} {...register('note')} />}
        </Field>
      </div>
    </Dialog>
  );
}

export function OverrideDialog({ kind, open, current, onClose, onSave }: {
  kind: 'priority' | 'severity';
  open: boolean;
  current: number | string;
  onClose: () => void;
  onSave: (value: number | string, reason: string) => void;
}) {
  const { t } = useTranslation();
  const schema = z.object({
    value: kind === 'priority' ? z.coerce.number().int().min(0, t('detail.range')).max(100, t('detail.range')) : z.string().min(1),
    reason: z.string().trim().min(3, t('detail.reasonRequired')).max(500),
  });
  const { register, handleSubmit, formState, reset } = useForm<{ value: number | string; reason: string }>({
    resolver: zodResolver(schema),
    values: { value: current, reason: '' },
  });
  const close = () => { reset(); onClose(); };
  return (
    <Dialog open={open} onClose={close} title={t(kind === 'priority' ? 'detail.changePriority' : 'detail.changeSeverity')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
          <Button onClick={() => void handleSubmit((v) => onSave(v.value, v.reason))()}>{t('common.save')}</Button>
        </>
      }>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">{t('detail.overrideHint')}</p>
        <Field label={t(kind === 'priority' ? 'detail.newPriority' : 'detail.newSeverity')} error={formState.errors.value?.message}>
          {({ id, describedBy, invalid }) =>
            kind === 'priority' ? (
              <TextInput id={id} aria-describedby={describedBy} invalid={invalid} type="number" min={0} max={100} {...register('value')} />
            ) : (
              <Select id={id} aria-describedby={describedBy} {...register('value')}>
                {SEVERITIES.map((s) => <option key={s} value={s}>{t(`severity.${s}`)}</option>)}
              </Select>
            )
          }
        </Field>
        <Field label={t('detail.reason')} hint={t('detail.reasonHint')} error={formState.errors.reason?.message}>
          {({ id, describedBy, invalid }) => <TextArea id={id} aria-describedby={describedBy} invalid={invalid} rows={2} {...register('reason')} />}
        </Field>
      </div>
    </Dialog>
  );
}
