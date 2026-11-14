import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { AttributionControl, CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import { InvalidateOnResize } from './Resize';
import { NAIROBI, TILE_ATTRIBUTION, TILE_URL, pinIcon } from './base';

interface Props {
  lat?: number;
  lng?: number;
  onChange: (lat: number, lng: number) => void;
  // Other open reports close by, drawn as small dots.
  others?: { lat: number; lng: number; label: string }[];
  // Edge to edge, without the rounded border.
  bleed?: boolean;
}

// Keeps the map centred on the pin when the position changes from outside (GPS).
function Recenter({ lat, lng }: { lat?: number; lng?: number }) {
  const map = useMap();
  const last = useRef<string>();
  useEffect(() => {
    if (lat == null || lng == null) return;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (last.current === undefined || !map.getBounds().contains([lat, lng])) map.setView([lat, lng], 17);
    last.current = key;
  }, [lat, lng, map]);
  return null;
}

function TapToMove({ onChange }: { onChange: Props['onChange'] }) {
  useMapEvents({ click: (e) => onChange(e.latlng.lat, e.latlng.lng) });
  return null;
}

// The pin can be dragged, the map tapped, or (keyboard) the focused pin moved
// with the arrow keys about 5 m at a time.
export default function LocationPicker({ lat, lng, onChange, others = [], bleed = false }: Props) {
  const { t } = useTranslation();
  const markerRef = useRef<L.Marker>(null);
  const position: [number, number] = lat != null && lng != null ? [lat, lng] : NAIROBI;
  const handlers = useMemo(
    () => ({
      dragend() {
        const m = markerRef.current;
        if (m) {
          const p = m.getLatLng();
          onChange(p.lat, p.lng);
        }
      },
      add() {
        const el = markerRef.current?.getElement();
        if (!el) return;
        el.setAttribute('aria-label', t('report.location.pinLabel'));
        el.setAttribute('role', 'button');
        el.addEventListener('keydown', (e: KeyboardEvent) => {
          const step = 0.00005;
          const p = markerRef.current!.getLatLng();
          const moves: Record<string, [number, number]> = {
            ArrowUp: [step, 0],
            ArrowDown: [-step, 0],
            ArrowLeft: [0, -step],
            ArrowRight: [0, step],
          };
          const d = moves[e.key];
          if (!d) return;
          e.preventDefault();
          onChange(p.lat + d[0], p.lng + d[1]);
        });
      },
    }),
    [onChange, t],
  );
  return (
    <div
      className={`flow-map-soft isolate h-full min-h-[260px] overflow-hidden ${bleed ? '' : 'rounded-lg border-2 border-surface-line'}`}
      role="region"
      aria-label={t('report.location.mapLabel')}
    >
      <MapContainer center={position} zoom={lat != null ? 17 : 12} className="h-full w-full" scrollWheelZoom={false} attributionControl={false}>
        {/* Top right, so the address card never hides the map credit. */}
        <AttributionControl position="topright" prefix={false} />
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <InvalidateOnResize />
        <Recenter lat={lat} lng={lng} />
        <TapToMove onChange={onChange} />
        {others.map((o, i) => (
          <CircleMarker key={i} center={[o.lat, o.lng]} radius={7} interactive={false}
            pathOptions={{ color: '#fff', weight: 2, fillColor: '#c2410c', fillOpacity: 1 }}>
            <Tooltip>{o.label}</Tooltip>
          </CircleMarker>
        ))}
        {lat != null && lng != null && (
          <Marker position={[lat, lng]} draggable icon={pinIcon} ref={markerRef} eventHandlers={handlers} keyboard autoPan />
        )}
      </MapContainer>
    </div>
  );
}
