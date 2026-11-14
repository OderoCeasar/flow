import { useEffect, useState } from 'react';
import { severityColors } from '../../design/tokens';
import type { Severity } from '../../lib/types';

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

// The technician's position, if they allow it. Distances on the job list are
// straight-line estimates from here; without permission they're just hidden.
export function useMyPosition() {
  const [pos, setPos] = useState<{ lat: number; lng: number }>();
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setPos(undefined),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return pos;
}

// Google Maps with every job as a stop, in the order given (max 9 stops in between).
export function routeUrl(stops: { lat: number; lng: number }[]) {
  const last = stops[stops.length - 1]!;
  const via = stops.slice(0, -1).slice(0, 9).map((s) => `${s.lat},${s.lng}`).join('|');
  const q = new URLSearchParams({ api: '1', destination: `${last.lat},${last.lng}`, travelmode: 'driving' });
  if (via) q.set('waypoints', via);
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

// The edge colour is decoration; the severity is always written on the card too.
export function severityEdge(s: Severity | null) {
  return s ? severityColors[s].dot : '#94a3b8';
}
