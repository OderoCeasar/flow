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
