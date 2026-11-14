import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { TILE_ATTRIBUTION, TILE_URL, pinIcon } from './base';

// A small, still map for the report drawer. It isn't interactive, so it's
// hidden from assistive tech; the address next to it says the same thing.
export default function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="flow-map-soft isolate h-full w-full overflow-hidden rounded-lg" aria-hidden="true">
      <MapContainer
        key={`${lat},${lng}`}
        center={[lat, lng]}
        zoom={16}
        className="h-full w-full"
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <Marker position={[lat, lng]} icon={pinIcon} interactive={false} keyboard={false} />
      </MapContainer>
    </div>
  );
}
