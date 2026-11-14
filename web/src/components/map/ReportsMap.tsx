import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import { leakName } from '../ui/Badges';
import { IconDrop, IconSearch, IconWarning } from '../ui/Icons';
import type { Report, Zone } from '../../lib/types';
import { NAIROBI, TILE_ATTRIBUTION, TILE_URL, clusterIcon, severityPin } from './base';
import { InvalidateOnResize } from './Resize';
import { severityColors } from '../../design/tokens';

function FlyToSelected({ report }: { report?: Report }) {
  const map = useMap();
  useEffect(() => {
    if (!report) return;
    // Wait for the panel layout to settle, then measure before deciding to move.
    const timer = setTimeout(() => {
      map.invalidateSize({ pan: false });
      if (!map.getBounds().pad(-0.1).contains([report.lat, report.lng])) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        map.flyTo([report.lat, report.lng], Math.max(map.getZoom(), 14), { animate: !reduce, duration: 0.6 });
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [report?.id, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function FlyTo({ target }: { target?: { lat: number; lng: number; key: number } }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 14, { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  }, [target, map]);
  return null;
}

// Groups pins that would overlap at the current zoom into a numbered bubble.
// Clicking a bubble zooms in to show the pins inside it.
function Pins({ reports, selectedId, onSelect, onBounds }: {
  reports: Report[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onBounds?: (b: [number, number, number, number]) => void;
}) {
  const { t } = useTranslation();
  const map = useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
    moveend: () => {
      const b = map.getBounds();
      onBounds?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    },
  });
  const [zoom, setZoom] = useState(map.getZoom());
  const groups = useMemo(() => {
    const cell = 48;
    const buckets = new Map<string, Report[]>();
    const singles: Report[] = [];
    for (const r of reports) {
      if (r.id === selectedId || zoom >= 16) {
        singles.push(r);
        continue;
      }
      const p = map.project([r.lat, r.lng], zoom);
      const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
      buckets.set(key, [...(buckets.get(key) ?? []), r]);
    }
    const clusters: Report[][] = [];
    for (const b of buckets.values()) {
      if (b.length === 1) singles.push(b[0]!);
      else clusters.push(b);
    }
    return { singles, clusters };
  }, [reports, selectedId, zoom, map]);

  const label = (r: Report) =>
    `${r.reference_code}: ${leakName(t, r.leak_type, r.is_main)}, ${t(`severity.${r.severity ?? 'unknown'}`)}, ${t('priority.scoreLabel', { score: r.priority_score })}`;
  return (
    <>
      {groups.clusters.map((c) => {
        const lat = c.reduce((s, r) => s + r.lat, 0) / c.length;
        const lng = c.reduce((s, r) => s + r.lng, 0) / c.length;
        return (
          <Marker key={c.map((r) => r.id).join()} position={[lat, lng]} icon={clusterIcon(c.length)} keyboard={false}
            title={t('dashboard.clusterLabel', { count: c.length })}
            eventHandlers={{ click: () => map.flyToBounds(L.latLngBounds(c.map((r) => [r.lat, r.lng] as [number, number])).pad(0.3), { maxZoom: 17 }) }} />
        );
      })}
      {groups.singles.map((r) => (
        <Marker
          key={r.id}
          position={[r.lat, r.lng]}
          icon={severityPin(r.severity, r.id === selectedId)}
          zIndexOffset={r.id === selectedId ? 1000 : r.priority_score}
          // Pins are a pointer shortcut; every report is also a full-size,
          // keyboard-reachable row in the list (WCAG 2.5.8 equivalent control).
          keyboard={false}
          title={label(r)}
          eventHandlers={{ click: () => onSelect(r.id) }}
        >
          <Tooltip direction="top" offset={[0, -30]}>{r.reference_code} · {leakName(t, r.leak_type, r.is_main)}</Tooltip>
        </Marker>
      ))}
    </>
  );
}

export function SeverityLegend() {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-lg bg-surface/95 px-3 py-2 text-xs font-semibold shadow-sm" aria-label={t('dashboard.legend')}>
      {(['critical', 'high', 'medium', 'low'] as const).map((s) => {
        const Icon = s === 'critical' ? IconWarning : IconDrop;
        return (
          <li key={s} className="flex items-center gap-1" style={{ color: severityColors[s].fg }}>
            <Icon size={14} strokeWidth={2.4} />
            {t(`severity.${s}`)}
          </li>
        );
      })}
    </ul>
  );
}

// Map and list share one selection: clicking a pin selects its row, and
// selecting a row highlights (and if needed, flies to) its pin.
export default function ReportsMap({
  reports,
  selectedId,
  onSelect,
  onBounds,
  zones = [],
}: {
  reports: Report[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onBounds?: (b: [number, number, number, number]) => void;
  zones?: Zone[];
}) {
  const { t } = useTranslation();
  const selected = reports.find((r) => r.id === selectedId);
  const [target, setTarget] = useState<{ lat: number; lng: number; key: number }>();
  const [query, setQuery] = useState('');
  const [notFound, setNotFound] = useState(false);
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const z = zones.find((z) => z.name.toLowerCase().includes(query.trim().toLowerCase()));
    setNotFound(!z);
    if (z) setTarget({ lat: z.lat, lng: z.lng, key: Date.now() });
  };
  return (
    <div className="flow-map-soft relative isolate h-full min-h-[280px] w-full" role="region" aria-label={t('dashboard.mapLabel')}>
      <MapContainer center={NAIROBI} zoom={12} className="h-full w-full" zoomControl={false}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <InvalidateOnResize />
        <FlyToSelected report={selected} />
        <FlyTo target={target} />
        <Pins reports={reports} selectedId={selectedId} onSelect={onSelect} onBounds={onBounds} />
      </MapContainer>
      {zones.length > 0 && (
        <form role="search" onSubmit={search} className="absolute inset-x-4 top-4 z-[1000]">
          <label htmlFor="area-search" className="sr-only">{t('dashboard.searchArea')}</label>
          <div className="relative">
            <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input id="area-search" list="area-options" value={query} onChange={(e) => { setQuery(e.target.value); setNotFound(false); }}
              placeholder={t('dashboard.searchArea')}
              className="h-12 w-full rounded-lg border border-surface-line bg-surface pl-10 pr-3 text-sm shadow-md focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200" />
            <datalist id="area-options">{zones.map((z) => <option key={z.id} value={z.name} />)}</datalist>
          </div>
          {notFound && <p role="alert" className="mt-1 rounded bg-surface px-2 py-1 text-xs text-danger-700 shadow">{t('dashboard.areaNotFound')}</p>}
        </form>
      )}
      <div className="absolute inset-x-4 bottom-7 z-[1000]">
        <SeverityLegend />
      </div>
    </div>
  );
}
