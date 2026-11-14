import L from 'leaflet';
import { severityColors } from '../../design/tokens';

export const NAIROBI: [number, number] = [-1.2864, 36.8172];
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// A pin drawn in SVG, so no image files are needed and it scales cleanly.
export const pinIcon = L.divIcon({
  className: 'flow-pin',
  html: `<svg width="40" height="52" viewBox="0 0 40 52" aria-hidden="true"><path d="M20 51S3 33 3 19a17 17 0 0 1 34 0c0 14-17 32-17 32z" fill="#0b5cad" stroke="#fff" stroke-width="3"/><circle cx="20" cy="19" r="7" fill="#fff"/></svg>`,
  iconSize: [40, 52],
  iconAnchor: [20, 50],
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
