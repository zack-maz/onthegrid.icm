import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Map,
  Source,
  Layer,
  NavigationControl,
  ScaleControl,
  useMap,
} from '@vis.gl/react-maplibre';
import type { MapEvent } from '@vis.gl/react-maplibre';
import type { PickingInfo } from '@deck.gl/core';
import 'maplibre-gl/dist/maplibre-gl.css';

import { DeckGLOverlay } from './DeckGLOverlay';
import { EntityTooltip } from './EntityTooltip';
import { UtcClock } from '@/components/layout/UtcClock';
import { useMapStore } from '@/stores/mapStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useEntityLayers } from '@/hooks/useEntityLayers';
import { useSearchStore } from '@/stores/searchStore';
import type { MapEntity, SiteEntity } from '@/types/entities';
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
import { ProximityAlertOverlay } from './ProximityAlertOverlay';
import { MapLegend } from './MapLegend';

/** Watches notificationStore.flyToTarget and animates the map. Renders null. */
function FlyToHandler() {
  const { current: map } = useMap();
  const flyToTarget = useNotificationStore((s) => s.flyToTarget);
  const setFlyToTarget = useNotificationStore((s) => s.setFlyToTarget);

  useEffect(() => {
    if (!flyToTarget || !map) return;
    map.flyTo({
      center: [flyToTarget.lng, flyToTarget.lat],
      zoom: flyToTarget.zoom,
      ...(flyToTarget.pitch != null && { pitch: flyToTarget.pitch }),
      ...(flyToTarget.bearing != null && { bearing: flyToTarget.bearing }),
      duration: 1500,
    });
    setFlyToTarget(null);
  }, [flyToTarget, map, setFlyToTarget]);

  return null;
}

interface HoverState {
  entity: MapEntity | SiteEntity;
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
  const isSettingPin = useFilterStore((s) => s.isSettingPin);
  const setProximityPin = useFilterStore((s) => s.setProximityPin);
  const setSettingPin = useFilterStore((s) => s.setSettingPin);
  const entityLayers = useEntityLayers();

  // Search filter state for tooltip suppression
  const isSearchFilterActive = useSearchStore((s) => s.isFilterMode && s.matchedIds.size > 0);
  const searchMatchedIds = useSearchStore((s) => s.matchedIds);

  const [hover, setHover] = useState<HoverState | null>(null);

  const handleDeckHover = useCallback(
    (info: PickingInfo) => {
      if (!info.object) {
        setHover(null);
        hoverEntity(null);
        return;
      }
      const entity = info.object as MapEntity | SiteEntity;
      setHover({ entity, x: info.x, y: info.y });
      hoverEntity(entity.id);
    },
    [hoverEntity],
  );

  const setFlyToTarget = useNotificationStore((s) => s.setFlyToTarget);

  const handleDeckClick = useCallback(
    (info: PickingInfo) => {
      // Suppress entity selection when placing a proximity pin
      if (useFilterStore.getState().isSettingPin) return;
      if (!info.object) {
        // Empty map click dismisses detail panel and selection
        selectEntity(null);
        closeDetailPanel();
        return;
      }
      const entity = info.object as MapEntity | SiteEntity;
      if (selectedEntityId === entity.id) {
        // Re-click same entity: deselect and close panel
        selectEntity(null);
        closeDetailPanel();
      } else {
        // Click new entity: select, open panel, and fly to it
        selectEntity(entity.id);
        openDetailPanel();
        setFlyToTarget({ lng: entity.lng, lat: entity.lat, zoom: 10 });
      }
    },
    [selectedEntityId, selectEntity, openDetailPanel, closeDetailPanel, setFlyToTarget],
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

  const rawTooltipEntity = hover?.entity ?? null;
  // Suppress tooltip for non-matching entities during search filter
  const tooltipEntity = rawTooltipEntity && (
    isSearchFilterActive && !searchMatchedIds.has(rawTooltipEntity.id)
  )
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
        cursor={isSettingPin ? 'crosshair' : undefined}
        onLoad={handleLoad}
        onMouseMove={handleMouseMove}
        onClick={(e) => {
          if (isSettingPin) {
            setProximityPin({ lat: e.lngLat.lat, lng: e.lngLat.lng });
            setSettingPin(false);
          }
        }}
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
        <ProximityAlertOverlay />
        <FlyToHandler />
      </Map>
      <MapVignette />
      <MapLegend />
      <div className="absolute bottom-8 right-14 z-[var(--z-controls)] flex flex-col items-end gap-1">
        <UtcClock />
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
