import { useEffect } from 'react';
import { useMap } from '@vis.gl/react-maplibre';
import { INITIAL_VIEW_STATE } from './constants';

export function CompassControl() {
  const { current: mapRef } = useMap();

  useEffect(() => {
    if (!mapRef) return;

    const map = mapRef.getMap();
    const container = map.getContainer();
    const compassBtn = container.querySelector('.maplibregl-ctrl-compass');

    if (!compassBtn) return;

    const handleDblClick = (e: Event) => {
      e.stopPropagation();
      map.flyTo({
        center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
        zoom: INITIAL_VIEW_STATE.zoom,
        pitch: INITIAL_VIEW_STATE.pitch,
        bearing: INITIAL_VIEW_STATE.bearing,
        duration: 1000,
      });
    };

    compassBtn.addEventListener('dblclick', handleDblClick);
    return () => {
      compassBtn.removeEventListener('dblclick', handleDblClick);
    };
  }, [mapRef]);

  return null;
}
