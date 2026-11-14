// Unfinished reports are saved on the device so nothing is lost if the app is
// closed or the connection drops. Reports that fail to send for lack of a
// connection wait in an outbox and go out when the phone is back online.
import { createStore, del, get, set, keys } from 'idb-keyval';
import type { Duration, LeakType, Size } from './types';

export interface Draft {
  photo?: Blob;
  noPhoto?: boolean;
  lat?: number;
  lng?: number;
  locationSource?: 'gps' | 'pin';
  addressText?: string;
  leakType?: LeakType | 'unsure';
  size?: Size;
  duration?: Duration;
  description?: string;
  phone?: string;
  joinClusterId?: string;
  updatedAt: number;
}

export interface OutboxItem extends Draft {
  id: string;
  locale: string;
  queuedAt: number;
}

const store = (() => {
  try {
    return createStore('flow', 'kv');
  } catch {
    return undefined;
  }
})();
const DRAFT_KEY = 'draft';
const OUTBOX_PREFIX = 'outbox:';

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback; // private mode or storage blocked: carry on without saving
  }
}

export const loadDraft = () => safe(() => get<Draft>(DRAFT_KEY, store), undefined);
export const saveDraft = (d: Omit<Draft, 'updatedAt'>) => safe(() => set(DRAFT_KEY, { ...d, updatedAt: Date.now() }, store), undefined);
export const clearDraft = () => safe(() => del(DRAFT_KEY, store), undefined);

export async function queueReport(item: Omit<OutboxItem, 'id' | 'queuedAt' | 'updatedAt'>): Promise<void> {
  const id = crypto.randomUUID?.() ?? String(Date.now());
  await safe(() => set(OUTBOX_PREFIX + id, { ...item, id, queuedAt: Date.now(), updatedAt: Date.now() }, store), undefined);
}

export async function outbox(): Promise<OutboxItem[]> {
  const all = await safe(() => keys(store), [] as IDBValidKey[]);
  const items = await Promise.all(
    all.filter((k) => String(k).startsWith(OUTBOX_PREFIX)).map((k) => safe(() => get<OutboxItem>(k, store), undefined)),
  );
  return items.filter((x): x is OutboxItem => !!x).sort((a, b) => a.queuedAt - b.queuedAt);
}

export const removeFromOutbox = (id: string) => safe(() => del(OUTBOX_PREFIX + id, store), undefined);

// Reference codes of reports sent from this device, so "My reports" works without an account.
const REFS_KEY = 'flow.myRefs';
export function rememberRef(ref: string) {
  try {
    const refs = new Set<string>(JSON.parse(localStorage.getItem(REFS_KEY) ?? '[]'));
    refs.add(ref);
    localStorage.setItem(REFS_KEY, JSON.stringify([...refs].slice(-50)));
  } catch {
    // ignore
  }
}
export function rememberedRefs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(REFS_KEY) ?? '[]');
  } catch {
    return [];
  }
}
