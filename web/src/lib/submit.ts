import { upload } from './api';
import { outbox, removeFromOutbox, rememberRef, type Draft } from './drafts';
import type { CreateReportResult } from './types';

export function buildForm(d: Omit<Draft, 'updatedAt'>, locale: string): FormData {
  const f = new FormData();
  if (d.photo) f.append('photo', d.photo, 'leak.jpg');
  if (d.lat != null) f.append('lat', String(d.lat));
  if (d.lng != null) f.append('lng', String(d.lng));
  if (d.addressText) f.append('address_text', d.addressText);
  if (d.leakType && d.leakType !== 'unsure') f.append('leak_type', d.leakType);
  if (d.size) f.append('size', d.size);
  if (d.duration) f.append('duration', d.duration);
  if (d.description) f.append('description', d.description);
  if (d.phone) f.append('phone', d.phone);
  if (d.joinClusterId) f.append('join_cluster_id', d.joinClusterId);
  f.append('locale', locale);
  return f;
}

export async function submitReport(d: Omit<Draft, 'updatedAt'>, locale: string, onProgress?: (pct: number) => void) {
  const res = await upload<CreateReportResult>('/reports', buildForm(d, locale), onProgress);
  rememberRef(res.reference_code);
  return res;
}

// flushOutbox sends queued reports. Network failures stay queued; reports the
// server rejects are dropped so they don't retry forever.
export async function flushOutbox(): Promise<CreateReportResult[]> {
  const sent: CreateReportResult[] = [];
  for (const item of await outbox()) {
    try {
      sent.push(await submitReport(item, item.locale));
      await removeFromOutbox(item.id);
    } catch (e: any) {
      if (e?.status === 0) break; // still offline
      if (e?.status >= 400 && e?.status < 500 && e?.status !== 429) await removeFromOutbox(item.id);
    }
  }
  return sent;
}
