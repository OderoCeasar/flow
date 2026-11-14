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

// "Today, 9:42 am", "Yesterday, 4:10 pm" or "12 Nov, 9:42 am".
export function formatWhen(iso: string, t: TFunction, lang: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(lang === 'sw' ? 'sw-KE' : 'en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: lang !== 'sw',
  });
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('time.today', { time });
  if (d.toDateString() === yesterday.toDateString()) return t('time.yesterday', { time });
  const day = d.toLocaleDateString(lang === 'sw' ? 'sw-KE' : 'en-GB', { day: 'numeric', month: 'short' });
  return `${day}, ${time}`;
}

// "3d 4h", "18h", "25m": how long a report has been open.
export function ageShort(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days}d ${rest}h` : `${days}d`;
}

// "Otieno Ochieng" → "OO"
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

// "Otieno Ochieng" → "O. Ochieng"
export function shortName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]![0]}. ${parts.slice(1).join(' ')}` : name;
}

export function distance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
