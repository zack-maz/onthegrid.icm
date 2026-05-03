import { MapboxOverlay } from '@deck.gl/mapbox';
import { useControl } from '@vis.gl/react-maplibre';

import type { MapboxOverlayProps } from '@deck.gl/mapbox';

export function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}
