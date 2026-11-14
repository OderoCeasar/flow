import { lazy, Suspense, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { EmptyState, ErrorState, ListSkeleton, Notice, Skeleton } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import type { Role, Settings } from '../../lib/types';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { DispatcherShell } from '../dispatcher/DispatcherShell';

const PolygonEditor = lazy(() => import('../../components/map/AreaEditor').then((m) => ({ default: m.PolygonEditor })));
const PointPicker = lazy(() => import('../../components/map/AreaEditor').then((m) => ({ default: m.PointPicker })));

interface Utility {
  id: string;
  name: string;
  service_area: { type: 'MultiPolygon'; coordinates: number[][][][] };
}
interface Staff {
  id: string;
  name: string;
  email?: string;
  role: Role;
  utility_id?: string;
  active: boolean;
}
interface Site {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lng: number;
}

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-touch items-center border-b-4 px-3 font-semibold focus-visible:outline focus-visible:outline-3 focus-visible:outline-focus ${
    isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink'
  }`;

function useUtilities() {
  return useQuery({ queryKey: ['admin', 'utilities'], queryFn: () => api<{ items: Utility[] }>('/admin/utilities') });
}

export default function Admin() {
  const { t } = useTranslation();
  return (
    <DispatcherShell title={t('admin.title')}>
      <div className="flex w-full max-w-5xl flex-col gap-4">
        <nav aria-label={t('admin.sections')} className="flex flex-wrap gap-1 border-b border-surface-line">
          <NavLink to="/admin/priority" className={tab}>{t('admin.priority')}</NavLink>
          <NavLink to="/admin/sites" className={tab}>{t('admin.sites')}</NavLink>
          <NavLink to="/admin/staff" className={tab}>{t('admin.staff')}</NavLink>
          <NavLink to="/admin/utilities" className={tab}>{t('admin.utilities')}</NavLink>
        </nav>
        <Routes>
          <Route index element={<Navigate to="priority" replace />} />
          <Route path="priority" element={<PriorityTab />} />
          <Route path="sites" element={<SitesTab />} />
          <Route path="staff" element={<StaffTab />} />
          <Route path="utilities" element={<UtilitiesTab />} />
        </Routes>
      </div>
    </DispatcherShell>
  );
}

// --- Priority weights ---

const WEIGHT_KEYS = ['severity', 'duplicates', 'age', 'sensitive_site', 'water_loss', 'main_pipe'] as const;
const PARAM_KEYS = ['sensitive_radius_m', 'duplicate_cap', 'age_cap_hours', 'water_loss_cap_lpd', 'duplicate_radius_m', 'duplicate_window_days', 'review_confidence'] as const;

function PriorityTab() {
  const { t } = useTranslation();
  const utilities = useUtilities();
  const [utilityId, setUtilityId] = useState('');
  useEffect(() => {
    if (!utilityId && utilities.data?.items[0]) setUtilityId(utilities.data.items[0].id);
  }, [utilities.data, utilityId]);
  if (utilities.isLoading) return <ListSkeleton rows={3} />;
  if (!utilities.data?.items.length) return <EmptyState title={t('admin.noUtilities')} />;
  return (
    <div className="flex flex-col gap-4">
      {utilities.data.items.length > 1 && (
        <Field label={t('admin.utility')}>
          {({ id }) => (
            <Select id={id} value={utilityId} onChange={(e) => setUtilityId(e.target.value)}>
              {utilities.data!.items.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
        </Field>
      )}
      {utilityId && <SettingsForm key={utilityId} utilityId={utilityId} />}
    </div>
  );
}

function SettingsForm({ utilityId }: { utilityId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const q = useQuery({ queryKey: ['admin', 'settings', utilityId], queryFn: () => api<{ settings: Settings; defaults: Settings }>(`/admin/priority-settings/${utilityId}`) });
  const { register, handleSubmit, watch, reset, setError, formState } = useForm<Settings>({ values: q.data?.settings });
  const save = useMutation({
    mutationFn: (s: Settings) => api<{ settings: Settings }>(`/admin/priority-settings/${utilityId}`, { method: 'PUT', json: s }),
    onSuccess: () => toast({ tone: 'success', message: t('admin.settingsSaved') }),
    onError: (e) => {
      if (e instanceof ApiError) for (const [k, v] of Object.entries(e.fields)) setError(k as keyof Settings, { message: v });
      toast({ tone: 'error', message: errorMessage(e) });
    },
  });
  if (q.isLoading) return <Skeleton className="h-96 w-full" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const weights = watch('weights');
  const total = weights ? WEIGHT_KEYS.reduce((sum, k) => sum + Number(weights[k] || 0), 0) : 0;
  const toNumbers = (s: Settings): Settings => ({
    weights: Object.fromEntries(WEIGHT_KEYS.map((k) => [k, Number(s.weights[k])])) as Settings['weights'],
    params: Object.fromEntries(PARAM_KEYS.map((k) => [k, Number(s.params[k])])) as Settings['params'],
  });
  const fieldErr = (path: string) => (formState.errors as any)?.[path]?.message as string | undefined;
  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => void handleSubmit((s) => save.mutate(toNumbers(s)))(e)}>
      <section className="flex flex-col gap-3 rounded-lg bg-surface p-4">
        <h2 className="text-lg font-semibold">{t('admin.weightsTitle')}</h2>
        <p className="text-sm text-ink-muted">{t('admin.weightsHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WEIGHT_KEYS.map((k) => (
            <Field key={k} label={t(`admin.weights.${k}`)} hint={t(`admin.weightHints.${k}`)} error={fieldErr(`weights.${k}`)}>
              {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} type="number" min={0} max={100} step={1} {...register(`weights.${k}`)} />}
            </Field>
          ))}
        </div>
        <p role="status" className={`text-sm font-semibold ${total === 100 ? 'text-success-700' : 'text-warning-800'}`}>
          {t('admin.weightsTotal', { total })}
        </p>
      </section>
      <section className="flex flex-col gap-3 rounded-lg bg-surface p-4">
        <h2 className="text-lg font-semibold">{t('admin.paramsTitle')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PARAM_KEYS.map((k) => (
            <Field key={k} label={t(`admin.params.${k}`)} error={fieldErr(`params.${k}`)}>
              {({ id }) => <TextInput id={id} type="number" step={k === 'review_confidence' ? 0.05 : 1} {...register(`params.${k}`)} />}
            </Field>
          ))}
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={save.isPending}>{t('common.save')}</Button>
        <Button variant="ghost" onClick={() => q.data && reset(q.data.defaults)}>{t('admin.resetDefaults')}</Button>
      </div>
      <Notice>{t('admin.rescoreNote')}</Notice>
    </form>
  );
}

// --- Sensitive sites ---

function SitesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const sites = useQuery({ queryKey: ['admin', 'sites'], queryFn: () => api<{ items: Site[] }>('/admin/sensitive-sites') });
  const [point, setPoint] = useState<[number, number]>();
  const [remove, setRemove] = useState<Site>();
  const { register, handleSubmit, reset, formState } = useForm<{ name: string; kind: string }>({
    resolver: zodResolver(z.object({ name: z.string().trim().min(1, t('admin.nameRequired')), kind: z.string() })),
    defaultValues: { name: '', kind: 'hospital' },
  });
  const create = useMutation({
    mutationFn: (v: { name: string; kind: string }) => api('/admin/sensitive-sites', { method: 'POST', json: { ...v, lat: point![0], lng: point![1] } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'sites'] });
      reset();
      setPoint(undefined);
      toast({ tone: 'success', message: t('admin.siteAdded') });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/admin/sensitive-sites/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'sites'] });
      toast({ tone: 'success', message: t('admin.siteRemoved') });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form className="flex flex-col gap-3 rounded-lg bg-surface p-4" onSubmit={(e) => void handleSubmit((v) => create.mutate(v))(e)}>
        <h2 className="text-lg font-semibold">{t('admin.addSite')}</h2>
        <p className="text-sm text-ink-muted">{t('admin.siteHint')}</p>
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <PointPicker point={point} onChange={(lat, lng) => setPoint([lat, lng])} />
        </Suspense>
        <Field label={t('admin.siteName')} error={formState.errors.name?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} invalid={invalid} {...register('name')} />}
        </Field>
        <Field label={t('admin.siteKind')}>
          {({ id }) => (
            <Select id={id} {...register('kind')}>
              {['hospital', 'school', 'clinic', 'market', 'other'].map((k) => <option key={k} value={k}>{t(`siteKind.${k}`)}</option>)}
            </Select>
          )}
        </Field>
        {!point && <p className="text-sm text-ink-muted">{t('admin.clickMap')}</p>}
        <Button type="submit" disabled={!point} loading={create.isPending}>{t('admin.addSite')}</Button>
      </form>
      <section className="rounded-lg bg-surface p-4">
        <h2 className="mb-2 text-lg font-semibold">{t('admin.sitesList', { count: sites.data?.items.length ?? 0 })}</h2>
        {sites.isLoading && <ListSkeleton rows={4} />}
        {sites.isError && <ErrorState message={errorMessage(sites.error)} onRetry={() => void sites.refetch()} />}
        <ul className="flex flex-col divide-y divide-surface-line">
          {sites.data?.items.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-1.5">
              <span>
                {s.name} <span className="text-sm text-ink-muted">· {t(`siteKind.${s.kind}`)}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => setRemove(s)}>{t('common.remove')}</Button>
            </li>
          ))}
        </ul>
      </section>
      <ConfirmDialog open={!!remove} danger title={t('admin.removeSiteTitle')} body={t('admin.removeSiteBody', { name: remove?.name })}
        confirmLabel={t('common.remove')} onCancel={() => setRemove(undefined)}
        onConfirm={() => { if (remove) del.mutate(remove.id); setRemove(undefined); }} />
    </div>
  );
}

// --- Staff ---

function StaffTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const staff = useQuery({ queryKey: ['admin', 'staff'], queryFn: () => api<{ items: Staff[] }>('/admin/staff') });
  const utilities = useUtilities();
  const { register, handleSubmit, reset, setError, formState } = useForm<{ name: string; email: string; role: string; utility_id: string; password: string }>({
    resolver: zodResolver(
      z.object({
        name: z.string().trim().min(1, t('admin.nameRequired')),
        email: z.string().email(t('staff.emailInvalid')),
        role: z.string(),
        utility_id: z.string(),
        password: z.string().min(10, t('admin.passwordShort')),
      }),
    ),
    defaultValues: { role: 'dispatcher', utility_id: '' },
  });
  const create = useMutation({
    mutationFn: (v: Record<string, string>) => api('/admin/staff', { method: 'POST', json: { ...v, utility_id: v.utility_id || undefined } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
      reset();
      toast({ tone: 'success', message: t('admin.staffAdded') });
    },
    onError: (e) => {
      if (e instanceof ApiError) for (const [k, v] of Object.entries(e.fields)) setError(k as any, { message: v });
      toast({ tone: 'error', message: errorMessage(e) });
    },
  });
  const toggle = useMutation({
    mutationFn: (s: Staff) => api(`/admin/staff/${s.id}`, { method: 'PATCH', json: { active: !s.active } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'staff'] }),
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });
  const utilityName = (id?: string) => utilities.data?.items.find((u) => u.id === id)?.name ?? '—';
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="overflow-x-auto rounded-lg bg-surface p-4">
        <h2 className="mb-2 text-lg font-semibold">{t('admin.staff')}</h2>
        {staff.isLoading && <ListSkeleton rows={4} />}
        {staff.isError && <ErrorState message={errorMessage(staff.error)} onRetry={() => void staff.refetch()} />}
        {staff.data && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-muted">
                <th scope="col" className="py-2">{t('admin.name')}</th>
                <th scope="col">{t('admin.role')}</th>
                <th scope="col">{t('admin.utility')}</th>
                <th scope="col">{t('admin.access')}</th>
              </tr>
            </thead>
            <tbody>
              {staff.data.items.map((s) => (
                <tr key={s.id} className="border-t border-surface-line">
                  <td className="py-2">{s.name}<span className="block text-xs text-ink-muted">{s.email}</span></td>
                  <td>{t(`roles.${s.role}`)}</td>
                  <td>{utilityName(s.utility_id)}</td>
                  <td>
                    <Button size="sm" variant="ghost" onClick={() => toggle.mutate(s)}>
                      {s.active ? t('admin.turnOff') : t('admin.turnOn')}
                    </Button>
                    {!s.active && <span className="text-xs text-ink-muted"> ({t('admin.off')})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <form className="flex flex-col gap-3 rounded-lg bg-surface p-4" onSubmit={(e) => void handleSubmit((v) => create.mutate(v))(e)} noValidate>
        <h2 className="text-lg font-semibold">{t('admin.addStaff')}</h2>
        <Field label={t('admin.name')} error={formState.errors.name?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} invalid={invalid} {...register('name')} />}
        </Field>
        <Field label={t('staff.email')} error={formState.errors.email?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} invalid={invalid} type="email" {...register('email')} />}
        </Field>
        <Field label={t('admin.role')}>
          {({ id }) => (
            <Select id={id} {...register('role')}>
              {['dispatcher', 'technician', 'admin'].map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t('admin.utility')} error={formState.errors.utility_id?.message}>
          {({ id, describedBy }) => (
            <Select id={id} aria-describedby={describedBy} {...register('utility_id')}>
              <option value="">{t('admin.noUtility')}</option>
              {utilities.data?.items.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t('admin.tempPassword')} hint={t('admin.passwordHint')} error={formState.errors.password?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} invalid={invalid} type="password" autoComplete="new-password" {...register('password')} />}
        </Field>
        <Button type="submit" loading={create.isPending}>{t('admin.addStaff')}</Button>
      </form>
    </div>
  );
}

// --- Utilities and service areas ---

function UtilitiesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const utilities = useUtilities();
  const [points, setPoints] = useState<[number, number][]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api('/admin/utilities', {
        method: 'POST',
        json: { name, service_area: { type: 'Polygon', coordinates: [[...points, points[0]].map(([lat, lng]) => [lng, lat])] } },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'utilities'] });
      setPoints([]);
      setName('');
      toast({ tone: 'success', message: t('admin.utilityAdded') });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const existing = (utilities.data?.items ?? []).flatMap((u) => u.service_area.coordinates.map((poly) => poly[0].map(([lng, lat]) => [lat, lng] as [number, number])));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="flex flex-col gap-3 rounded-lg bg-surface p-4">
        <h2 className="text-lg font-semibold">{t('admin.addUtility')}</h2>
        <p className="text-sm text-ink-muted">{t('admin.drawHint')}</p>
        <Suspense fallback={<Skeleton className="h-80 w-full" />}>
          <PolygonEditor points={points} onChange={setPoints} existing={existing} />
        </Suspense>
        <p role="status" className="text-sm text-ink-muted">{t('admin.points', { count: points.length })}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))}>{t('admin.undoPoint')}</Button>
          <Button size="sm" variant="ghost" disabled={!points.length} onClick={() => setPoints([])}>{t('admin.clearShape')}</Button>
        </div>
        <Field label={t('admin.utilityName')}>
          {({ id }) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        {error && <p role="alert" className="font-medium text-danger-700">{error}</p>}
        <Button disabled={points.length < 3 || !name.trim()} loading={create.isPending} onClick={() => { setError(''); create.mutate(); }}>
          {t('admin.saveUtility')}
        </Button>
      </section>
      <section className="rounded-lg bg-surface p-4">
        <h2 className="mb-2 text-lg font-semibold">{t('admin.utilities')}</h2>
        {utilities.isLoading && <ListSkeleton rows={2} />}
        <ul className="flex flex-col gap-1">
          {utilities.data?.items.map((u) => <li key={u.id} className="rounded bg-surface-muted px-2 py-1.5">{u.name}</li>)}
        </ul>
      </section>
    </div>
  );
}
