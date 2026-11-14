import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import type { Report } from '../../lib/types';
import { InvalidateOnResize } from './Resize';
import { NAIROBI, TILE_ATTRIBUTION, TILE_URL, scoreIcon } from './base';

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

function BoundsWatcher({ onBounds }: { onBounds?: (b: [number, number, number, number]) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      onBounds?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    },
  });
  return null;
}

// Map and list share one selection: clicking a marker selects its row, and
// selecting a row highlights (and if needed, flies to) its marker.
export default function ReportsMap({
  reports,
  selectedId,
  onSelect,
  onBounds,
}: {
  reports: Report[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onBounds?: (b: [number, number, number, number]) => void;
}) {
  const { t } = useTranslation();
  const selected = reports.find((r) => r.id === selectedId);
  return (
    <div className="h-full min-h-[280px] w-full" role="region" aria-label={t('dashboard.mapLabel')}>
      <MapContainer center={NAIROBI} zoom={12} className="h-full w-full">
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <InvalidateOnResize />
        <FlyToSelected report={selected} />
        <BoundsWatcher onBounds={onBounds} />
        {reports.map((r) => (
          <Marker
            key={r.id}
            position={[r.lat, r.lng]}
            icon={scoreIcon(r.priority_score, r.severity, r.id === selectedId)}
            zIndexOffset={r.id === selectedId ? 1000 : r.priority_score}
            // Markers are a pointer shortcut. Every report is also a full-size,
            // keyboard-reachable row in the list (WCAG 2.5.8 equivalent control).
            keyboard={false}
            title={`${r.reference_code}: ${t('priority.scoreLabel', { score: r.priority_score })}, ${t(`severity.${r.severity ?? 'unknown'}`)}, ${t(`leakType.${r.leak_type ?? 'unknown'}`)}`}
            eventHandlers={{ click: () => onSelect(r.id) }}
          >
            <Tooltip direction="top" offset={[0, -12]}>
              {r.reference_code} · {t(`leakType.${r.leak_type ?? 'unknown'}`)}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
