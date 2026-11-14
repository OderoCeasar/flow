import L from 'leaflet';
import { severityColors } from '../../design/tokens';

export const NAIROBI: [number, number] = [-1.2864, 36.8172];
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// A pin drawn in SVG, so no image files are needed and it scales cleanly.
export const pinIcon = L.divIcon({
  className: 'flow-pin',
  html: `<svg width="44" height="54" viewBox="0 0 44 54" aria-hidden="true"><path d="M22 52S4 34 4 21a18 18 0 0 1 36 0c0 13-18 31-18 31z" fill="#0b5cad" stroke="#fff" stroke-width="3.5" style="filter:drop-shadow(0 3px 4px rgba(15,44,74,.35))"/><path d="M22 13.5a7 7 0 0 0-7 7c0 4.6 7 10.5 7 10.5s7-5.9 7-10.5a7 7 0 0 0-7-7z" fill="none" stroke="#fff" stroke-width="2"/><circle cx="22" cy="20.5" r="2.4" fill="#fff"/></svg>`,
  iconSize: [44, 54],
  iconAnchor: [22, 52],
});

// The dark shade of each severity, so the white number stays above 4.5:1.
const severityHex: Record<string, string> = Object.fromEntries(Object.entries(severityColors).map(([k, v]) => [k, v.fg]));

// Dashboard markers show the priority number, so the map never relies on colour alone.
export function scoreIcon(score: number, severity: string | null, selected: boolean) {
  const bg = severity ? severityHex[severity] : '#475569';
  const size = selected ? 40 : 30;
  return L.divIcon({
    className: 'flow-score',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${bg};color:#fff;font:700 ${
      selected ? 15 : 12
    }px system-ui;border:${selected ? 4 : 2}px solid ${selected ? '#111827' : '#fff'};box-shadow:0 1px 3px rgba(0,0,0,.4)">${score}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Dashboard pin: a drop in the severity's dark shade with a white drop (or "!"
// for critical) inside. The selected pin is larger with a soft halo.
export function severityPin(severity: string | null, selected: boolean) {
  const fill = severity ? severityHex[severity] : '#475569';
  const w = selected ? 44 : 32;
  const h = Math.round(w * 1.18);
  const glyph =
    severity === 'critical'
      ? '<path d="M20 12v8" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="25" r="1.8" fill="#fff"/>'
      : '<path d="M20 11.5c-2.6 3.6-4.4 6.2-4.4 8.6a4.4 4.4 0 0 0 8.8 0c0-2.4-1.8-5-4.4-8.6z" fill="none" stroke="#fff" stroke-width="2"/>';
  const halo = selected ? '<circle cx="20" cy="19" r="19" fill="' + fill + '" opacity=".22"/>' : '';
  return L.divIcon({
    className: 'flow-pin',
    html: `<svg width="${w}" height="${h}" viewBox="0 0 40 47" aria-hidden="true">${halo}<path d="M20 45S6 31 6 19.5a14 14 0 0 1 28 0C34 31 20 45 20 45z" fill="${fill}" stroke="#fff" stroke-width="2.5" style="filter:drop-shadow(0 2px 3px rgba(15,44,74,.35))"/>${glyph}</svg>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h - 2],
  });
}

export function clusterIcon(count: number) {
  const size = count < 10 ? 38 : count < 50 ? 44 : 50;
  return L.divIcon({
    className: 'flow-score',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:#0b5cad;color:#fff;font:700 15px 'Inter Variable',system-ui;border:3px solid #fff;box-shadow:0 2px 6px rgba(15,44,74,.35)">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
