import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

// Leaflet measures its container once; tell it when the container changes
// size (panels opening, lazy layouts settling) so tiles and centring stay right.
export function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}
