import { useCallback, useRef, useState } from 'react';
import {
  Map,
  Source,
  Layer,
  NavigationControl,
  ScaleControl,
} from '@vis.gl/react-maplibre';
import type { MapEvent } from '@vis.gl/react-maplibre';
import type { PickingInfo } from '@deck.gl/core';
import 'maplibre-gl/dist/maplibre-gl.css';

import { DeckGLOverlay } from './DeckGLOverlay';
import { EntityTooltip } from './EntityTooltip';
import { useMapStore } from '@/stores/mapStore';
import { useUIStore } from '@/stores/uiStore';
import { useEntityLayers } from '@/hooks/useEntityLayers';
import type { MapEntity } from '@/types/entities';
import {
  INITIAL_VIEW_STATE,
  MAX_BOUNDS,
  MAP_STYLE,
  TERRAIN_SOURCE_TILES,
  TERRAIN_ENCODING,
  TERRAIN_CONFIG,
  ROAD_LABEL_LAYERS,
  BORDER_LAYERS,
  WATER_LAYERS,
  MINOR_FEATURE_LAYERS,
} from './constants';
import { MapLoadingScreen } from './MapLoadingScreen';
import { MapVignette } from './MapVignette';
import { CoordinateReadout } from './CoordinateReadout';
import { CompassControl } from './CompassControl';

interface HoverState {
  entity: MapEntity;
  x: number;
  y: number;
}

export function BaseMap() {
  const isMapLoaded = useMapStore((s) => s.isMapLoaded);
  const setMapLoaded = useMapStore((s) => s.setMapLoaded);
  const setCursorPosition = useMapStore((s) => s.setCursorPosition);
  const selectedEntityId = useUIStore((s) => s.selectedEntityId);
  const selectEntity = useUIStore((s) => s.selectEntity);
  const openDetailPanel = useUIStore((s) => s.openDetailPanel);
  const closeDetailPanel = useUIStore((s) => s.closeDetailPanel);
  const hoverEntity = useUIStore((s) => s.hoverEntity);
  const showNews = useUIStore((s) => s.showNews);
  const entityLayers = useEntityLayers();

  const [hover, setHover] = useState<HoverState | null>(null);

  const handleDeckHover = useCallback(
    (info: PickingInfo) => {
      if (!info.object) {
        setHover(null);
        hoverEntity(null);
        return;
      }
      const entity = info.object as MapEntity;
      setHover({ entity, x: info.x, y: info.y });
      hoverEntity(entity.id);
    },
    [hoverEntity],
  );

  const handleDeckClick = useCallback(
    (info: PickingInfo) => {
      if (!info.object) {
        // Empty map click does NOT dismiss panel -- panel persists until explicitly closed
        return;
      }
      const entity = info.object as MapEntity;
      if (selectedEntityId === entity.id) {
        // Re-click same entity: deselect and close panel
        selectEntity(null);
        closeDetailPanel();
      } else {
        // Click new entity: select and open panel
        selectEntity(entity.id);
        openDetailPanel();
      }
    },
    [selectedEntityId, selectEntity, openDetailPanel, closeDetailPanel],
  );

  const handleLoad = useCallback(
    (e: MapEvent) => {
      const map = e.target;

      ROAD_LABEL_LAYERS.forEach((id) => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', 'none');
        }
      });

      MINOR_FEATURE_LAYERS.forEach((id) => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', 'none');
        }
      });

      BORDER_LAYERS.forEach((id) => {
        if (map.getLayer(id)) {
          map.setPaintProperty(id, 'line-color', '#888888');
          map.setPaintProperty(id, 'line-width', 1.5);
        }
      });

      WATER_LAYERS.forEach((id) => {
        if (map.getLayer(id)) {
          if (id === 'waterway') {
            map.setPaintProperty(id, 'line-color', '#0a1628');
          } else {
            map.setPaintProperty(id, 'fill-color', '#0a1628');
          }
        }
      });

      setMapLoaded();
    },
    [setMapLoaded],
  );

  const handleMouseMove = useCallback(
    (e: MapEvent<MouseEvent>) => {
      const lngLat = e.lngLat;
      setCursorPosition(lngLat.lng, lngLat.lat);
    },
    [setCursorPosition],
  );

  // Hover tooltip only (pinned tooltip replaced by detail panel)
  // Event entities (drone/missile) only show tooltips when News toggle is ON
  const isEventEntity = (e: MapEntity) => e.type === 'drone' || e.type === 'missile';
  const rawTooltipEntity = hover?.entity ?? null;
  const tooltipEntity = rawTooltipEntity && isEventEntity(rawTooltipEntity) && !showNews
    ? null
    : rawTooltipEntity;
  const tooltipPos = hover
    ? { x: hover.x, y: hover.y }
    : { x: 0, y: 0 };

  return (
    <div className="relative h-full w-full">
      <MapLoadingScreen isLoaded={isMapLoaded} />
      <Map
        initialViewState={INITIAL_VIEW_STATE}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        maxBounds={MAX_BOUNDS}
        minZoom={3}
        maxZoom={15}
        maxPitch={60}
        doubleClickZoom={false}
        terrain={TERRAIN_CONFIG}
        onLoad={handleLoad}
        onMouseMove={handleMouseMove}
      >
        <Source
          id="terrain-dem"
          type="raster-dem"
          tiles={TERRAIN_SOURCE_TILES}
          encoding={TERRAIN_ENCODING}
          tileSize={256}
        />
        <Layer
          id="terrain-hillshade"
          type="hillshade"
          source="terrain-dem"
          paint={{
            'hillshade-exaggeration': 0.6,
            'hillshade-shadow-color': '#000000',
            'hillshade-highlight-color': '#444444',
          }}
        />
        <NavigationControl
          showZoom={true}
          showCompass={true}
          visualizePitch={true}
          position="bottom-right"
        />
        <ScaleControl unit="metric" position="bottom-right" />
        <DeckGLOverlay
          layers={entityLayers}
          onHover={handleDeckHover}
          onClick={handleDeckClick}
          pickingRadius={12}
        />
        <CompassControl />
      </Map>
      <MapVignette />
      <div className="absolute bottom-8 right-14 z-[var(--z-controls)]">
        <CoordinateReadout />
      </div>
      {tooltipEntity && (
        <EntityTooltip
          entity={tooltipEntity}
          x={tooltipPos.x}
          y={tooltipPos.y}
        />
      )}
    </div>
  );
}
