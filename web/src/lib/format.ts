import type { TFunction } from 'i18next';

export function timeAgo(iso: string, t: TFunction): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t('time.justNow');
  if (mins < 60) return t('time.minutesAgo', { count: mins });
  const hours = Math.round(mins / 60);
  if (hours < 48) return t('time.hoursAgo', { count: hours });
  return t('time.daysAgo', { count: Math.round(hours / 24) });
}

export function duration(hours: number, t: TFunction): string {
  if (hours < 48) return t('time.hours', { count: Math.max(1, Math.round(hours)) });
  return t('time.days', { count: Math.round(hours / 24) });
}

export function formatDateTime(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang === 'sw' ? 'sw-KE' : 'en-KE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNumber(n: number, lang: string): string {
  return n.toLocaleString(lang === 'sw' ? 'sw-KE' : 'en-KE');
}

export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
