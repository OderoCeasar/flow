import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import type { ReportDetail } from '../../lib/types';
import { useToast } from '../../components/ui/Toast';
import { useErrorMessage } from '../../lib/useErrorMessage';

export interface UpdateBody {
  status?: string;
  note?: string;
  severity?: string;
  severity_reason?: string;
  priority_override?: number;
  priority_override_reason?: string;
  clear_priority_override?: boolean;
  leak_type?: string;
  size_estimate?: string;
  is_main?: boolean;
  accept_ai?: boolean;
  needs_review?: boolean;
}

// All dispatcher changes go through here so every one gets the same
// confirmation toast, error message and (where it makes sense) Undo.
export function useReportActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();

  const refresh = (detail?: ReportDetail) => {
    if (detail) qc.setQueryData(['report', detail.report.id], detail);
    void qc.invalidateQueries({ queryKey: ['reports'] });
    void qc.invalidateQueries({ queryKey: ['stats'] });
  };

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateBody; message: string; undo?: UpdateBody }) =>
      api<ReportDetail>(`/utility/reports/${id}`, { method: 'PATCH', json: body }),
    onSuccess: (detail, vars) => {
      refresh(detail);
      toast({
        tone: 'success',
        message: vars.message,
        undo: vars.undo
          ? () =>
              void api<ReportDetail>(`/utility/reports/${vars.id}`, { method: 'PATCH', json: vars.undo })
                .then((d) => {
                  refresh(d);
                  toast({ tone: 'success', message: t('actions.undone') });
                })
                .catch((e) => toast({ tone: 'error', message: errorMessage(e) }))
          : undefined,
      });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });

  const assign = useMutation({
    mutationFn: ({ id, technician_id, due_at }: { id: string; technician_id: string; due_at?: string; name: string }) =>
      api<ReportDetail>(`/utility/reports/${id}/assign`, { method: 'POST', json: { technician_id, due_at } }),
    onSuccess: (detail, vars) => {
      refresh(detail);
      toast({ tone: 'success', message: t('actions.assigned', { name: vars.name }) });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });

  const merge = useMutation({
    mutationFn: ({ target, source }: { target: string; source: string }) =>
      api<{ detail: ReportDetail; moved_report_ids: string[] }>('/utility/clusters/merge', {
        method: 'POST',
        json: { target_cluster_id: target, cluster_ids: [source] },
      }),
    onSuccess: (res, vars) => {
      refresh(res.detail);
      toast({
        tone: 'success',
        message: t('actions.merged', { ref: res.detail.report.reference_code }),
        undo: () =>
          void api<ReportDetail>(`/utility/clusters/${vars.target}/split`, { method: 'POST', json: { report_ids: res.moved_report_ids } })
            .then((d) => {
              refresh(d);
              toast({ tone: 'success', message: t('actions.undone') });
            })
            .catch((e) => toast({ tone: 'error', message: errorMessage(e) })),
      });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });

  const split = useMutation({
    mutationFn: ({ clusterId, reportIds }: { clusterId: string; reportIds: string[] }) =>
      api<ReportDetail>(`/utility/clusters/${clusterId}/split`, { method: 'POST', json: { report_ids: reportIds } }),
    onSuccess: (detail) => {
      refresh(detail);
      toast({ tone: 'success', message: t('actions.split', { ref: detail.report.reference_code }) });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });

  return { update, assign, merge, split };
}
