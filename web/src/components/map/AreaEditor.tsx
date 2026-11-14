import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, Polygon, TileLayer, useMapEvents } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import { InvalidateOnResize } from './Resize';
import { NAIROBI, TILE_ATTRIBUTION, TILE_URL, pinIcon } from './base';

function Clicks({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// PolygonEditor: click to add corners of a service area.
export function PolygonEditor({
  points,
  onChange,
  existing = [],
}: {
  points: [number, number][];
  onChange: (pts: [number, number][]) => void;
  existing?: [number, number][][];
}) {
  const { t } = useTranslation();
  return (
    <div className="h-80 overflow-hidden rounded-lg border-2 border-surface-line" role="region" aria-label={t('admin.areaMapLabel')}>
      <MapContainer center={NAIROBI} zoom={10} className="h-full w-full">
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <InvalidateOnResize />
        <Clicks onClick={(lat, lng) => onChange([...points, [lat, lng]])} />
        {existing.map((ring, i) => (
          <Polygon key={i} positions={ring} pathOptions={{ color: '#64748b', weight: 2, fillOpacity: 0.05 }} />
        ))}
        {points.length > 0 && <Polygon positions={points} pathOptions={{ color: '#0b5cad', weight: 3, fillOpacity: 0.15 }} />}
      </MapContainer>
    </div>
  );
}

// PointPicker: click to place one point (a sensitive site).
export function PointPicker({ point, onChange }: { point?: [number, number]; onChange: (lat: number, lng: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="h-64 overflow-hidden rounded-lg border-2 border-surface-line" role="region" aria-label={t('admin.siteMapLabel')}>
      <MapContainer center={point ?? NAIROBI} zoom={12} className="h-full w-full">
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <InvalidateOnResize />
        <Clicks onClick={onChange} />
        {point && <Marker position={point} icon={pinIcon} />}
      </MapContainer>
    </div>
  );
}
