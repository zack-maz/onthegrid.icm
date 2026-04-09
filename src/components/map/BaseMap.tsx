import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Map,
  Source,
  Layer,
  NavigationControl,
  ScaleControl,
  useMap,
  type MapRef,
} from '@vis.gl/react-maplibre';
import type { MapEvent, MapMouseEvent } from '@vis.gl/react-maplibre';
import type { PickingInfo } from '@deck.gl/core';
import 'maplibre-gl/dist/maplibre-gl.css';

import { DeckGLOverlay } from './DeckGLOverlay';
import { EntityTooltip } from './EntityTooltip';
import { WeatherTooltip, useWeatherLayers } from './layers/WeatherOverlay';
import { ThreatTooltip, useThreatHeatmapLayers } from './layers/ThreatHeatmapOverlay';
import type { ThreatZoneData } from './layers/ThreatHeatmapOverlay';
import type { ThreatCluster } from '@/types/ui';
import { UtcClock } from '@/components/layout/UtcClock';
import { useMapStore } from '@/stores/mapStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useEntityLayers } from '@/hooks/useEntityLayers';
import { useSearchStore } from '@/stores/searchStore';
import { useLayerStore } from '@/stores/layerStore';
import { getCurrentPanelView } from '@/lib/panelLabel';
import type { MapEntity, SiteEntity } from '@/types/entities';
import type { WeatherGridPoint } from '@/stores/weatherStore';
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
import { GeographicOverlay } from './layers/GeographicOverlay';
import { WeatherHeatmap } from './layers/WeatherHeatmap';
import { PoliticalOverlay, usePoliticalLayers } from './layers/PoliticalOverlay';
import { useEthnicLayers, EthnicTooltip } from './layers/EthnicOverlay';
import { useWaterLayers } from '@/hooks/useWaterLayers';
import { WaterTooltip } from './layers/WaterOverlay';
import { usePrecisionRingLayer } from './PrecisionRingLayer';
import type { WaterFacility } from '../../../server/types';

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

/**
 * Dev-only: exposes the underlying MapLibre map instance on `window.__map`
 * so Playwright capture scripts (scripts/capture-hero.ts) can drive the
 * map programmatically without UI interaction. Gated by import.meta.env.DEV,
 * so production builds never see this code. Renders null.
 */
function MapDevExposer() {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map) return;
    const w = window as unknown as { __map?: unknown };
    w.__map = map.getMap();
    return () => {
      delete w.__map;
    };
  }, [map]);

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
  const setSelectedCluster = useUIStore((s) => s.setSelectedCluster);
  const openDetailPanel = useUIStore((s) => s.openDetailPanel);
  const closeDetailPanel = useUIStore((s) => s.closeDetailPanel);
  const hoverEntity = useUIStore((s) => s.hoverEntity);
  const isSettingPin = useFilterStore((s) => s.isSettingPin);
  const setProximityPin = useFilterStore((s) => s.setProximityPin);
  const setSettingPin = useFilterStore((s) => s.setSettingPin);
  const isBelowCrossover = useMapStore((s) => s.isBelowCrossover);
  const setZoomRegion = useMapStore((s) => s.setZoomRegion);

  const mapRef = useRef<MapRef>(null);
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);

  const { conflictLayers, entityLayers } = useEntityLayers();
  const weatherLayers = useWeatherLayers();
  const threatLayers = useThreatHeatmapLayers(hoveredClusterId, isBelowCrossover);
  const politicalLayers = usePoliticalLayers();
  const ethnicLayers = useEthnicLayers();
  const { riverLayers, facilityLayers, destroyedIds: waterDestroyedIds } = useWaterLayers();
  const precisionRingLayers = usePrecisionRingLayer();
  const isWeatherActive = useLayerStore((s) => s.activeLayers.has('weather'));
  const isThreatActive = useLayerStore((s) => s.activeLayers.has('threat'));
  const isEthnicActive = useLayerStore((s) => s.activeLayers.has('ethnic'));
  const isWaterActive = useLayerStore((s) => s.activeLayers.has('water'));

  // Search filter state for tooltip suppression
  const isSearchFilterActive = useSearchStore((s) => s.isFilterMode && s.matchedIds.size > 0);
  const searchMatchedIds = useSearchStore((s) => s.matchedIds);

  const [hover, setHover] = useState<HoverState | null>(null);
  const [weatherHover, setWeatherHover] = useState<{
    point: WeatherGridPoint;
    x: number;
    y: number;
  } | null>(null);
  const [threatHover, setThreatHover] = useState<{
    zone: ThreatZoneData;
    x: number;
    y: number;
  } | null>(null);
  const [ethnicHover, setEthnicHover] = useState<{ groups: string[]; x: number; y: number } | null>(
    null,
  );
  const [waterHover, setWaterHover] = useState<{
    facility: WaterFacility;
    x: number;
    y: number;
  } | null>(null);

  const handleDeckHover = useCallback(
    (info: PickingInfo) => {
      if (!info.object) {
        setHover(null);
        setThreatHover(null);
        setEthnicHover(null);
        setWeatherHover(null);
        setWaterHover(null);
        setHoveredClusterId(null);
        hoverEntity(null);
        return;
      }

      // Threat cluster picker layer: show threat zone tooltip + hover dimming
      if (info.layer?.id === 'threat-cluster-picker' && isThreatActive) {
        const cluster = info.object as ThreatCluster;
        setThreatHover({ zone: cluster as unknown as ThreatZoneData, x: info.x, y: info.y });
        setHoveredClusterId(cluster.id);
        setHover(null);
        setEthnicHover(null);
        setWeatherHover(null);
        setWaterHover(null);
        hoverEntity(null);
        return;
      }

      // Ethnic zone hover: after threat, before weather
      if (
        (info.layer?.id === 'ethnic-zones' || info.layer?.id?.startsWith('ethnic-overlap-')) &&
        isEthnicActive
      ) {
        const props = (info.object as { properties: { group?: string; groups?: string[] } })
          .properties;
        const groups = props.groups ?? (props.group ? [props.group] : []);
        setEthnicHover({ groups, x: info.x, y: info.y });
        setHover(null);
        setThreatHover(null);
        setWeatherHover(null);
        setWaterHover(null);
        hoverEntity(null);
        return;
      }

      // Water facility hover
      if (info.layer?.id === 'water-facility-icons' && isWaterActive) {
        const facility = info.object as WaterFacility;
        setWaterHover({ facility, x: info.x, y: info.y });
        setHover(null);
        setThreatHover(null);
        setEthnicHover(null);
        setWeatherHover(null);
        hoverEntity(null);
        return;
      }

      // Weather picker layer: show weather tooltip
      if (info.layer?.id === 'weather-picker' && isWeatherActive) {
        const point = info.object as WeatherGridPoint;
        setWeatherHover({ point, x: info.x, y: info.y });
        setHover(null);
        setThreatHover(null);
        setEthnicHover(null);
        setWaterHover(null);
        hoverEntity(null);
        return;
      }

      // Entity hover (existing behavior)
      setWeatherHover(null);
      setThreatHover(null);
      setEthnicHover(null);
      setWaterHover(null);
      setHoveredClusterId(null);
      const entity = info.object as MapEntity | SiteEntity;
      setHover({ entity, x: info.x, y: info.y });
      hoverEntity(entity.id);
    },
    [hoverEntity, isWeatherActive, isThreatActive, isEthnicActive, isWaterActive],
  );

  const setFlyToTarget = useNotificationStore((s) => s.setFlyToTarget);

  const handleDeckClick = useCallback(
    (info: PickingInfo) => {
      // Suppress entity selection when placing a proximity pin
      if (useFilterStore.getState().isSettingPin) return;
      if (!info.object) {
        // Empty map click dismisses detail panel and selection
        selectEntity(null);
        setSelectedCluster(null);
        closeDetailPanel();
        useUIStore.getState().clearStack();
        return;
      }

      // Ethnic/political zones are pickable for hover only — ignore clicks
      if (info.layer?.id?.startsWith('ethnic-')) return;

      // Threat cluster picker: open cluster detail + fly to fit bounds
      if (info.layer?.id === 'threat-cluster-picker') {
        const cluster = info.object as ThreatCluster;
        const currentView = getCurrentPanelView();
        if (currentView) {
          useUIStore.getState().pushView(currentView);
        }
        setSelectedCluster(cluster);
        openDetailPanel();

        // Fly to fit the entire cluster bounding box
        const { minLat, maxLat, minLng, maxLng } = cluster.boundingBox;
        mapRef.current?.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          { padding: 80, duration: 1500, maxZoom: 10 },
        );
        return;
      }

      const entity = info.object as MapEntity | SiteEntity;
      if (selectedEntityId === entity.id) {
        // Re-click same entity: deselect and close panel
        selectEntity(null);
        closeDetailPanel();
      } else {
        // Click new entity: push current view, then select, open panel, and fly to it
        const currentView = getCurrentPanelView();
        if (currentView) {
          useUIStore.getState().pushView(currentView);
        }
        selectEntity(entity.id);
        openDetailPanel();
        setFlyToTarget({ lng: entity.lng, lat: entity.lat, zoom: 10 });
      }
    },
    [
      selectedEntityId,
      selectEntity,
      setSelectedCluster,
      openDetailPanel,
      closeDetailPanel,
      setFlyToTarget,
    ],
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
    (e: MapMouseEvent) => {
      const lngLat = e.lngLat;
      setCursorPosition(lngLat.lng, lngLat.lat);
    },
    [setCursorPosition],
  );

  const handleMove = useCallback(
    (e: MapEvent) => {
      const zoom = e.target.getZoom();
      setZoomRegion(zoom);
    },
    [setZoomRegion],
  );

  const rawTooltipEntity = hover?.entity ?? null;
  // Suppress tooltip for non-matching entities during search filter
  const tooltipEntity =
    rawTooltipEntity && isSearchFilterActive && !searchMatchedIds.has(rawTooltipEntity.id)
      ? null
      : rawTooltipEntity;
  const tooltipPos = hover ? { x: hover.x, y: hover.y } : { x: 0, y: 0 };

  return (
    <div className="relative h-full w-full">
      <MapLoadingScreen isLoaded={isMapLoaded} />
      <Map
        ref={mapRef}
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
        onMove={handleMove}
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
            'hillshade-exaggeration': 0.8,
            'hillshade-shadow-color': '#000000',
            'hillshade-highlight-color': '#444444',
          }}
        />
        <PoliticalOverlay />
        <WeatherHeatmap />
        <GeographicOverlay />
        <NavigationControl
          showZoom={true}
          showCompass={true}
          visualizePitch={true}
          position="bottom-right"
        />
        <ScaleControl unit="metric" position="bottom-right" />
        <DeckGLOverlay
          layers={
            isBelowCrossover
              ? [
                  ...politicalLayers,
                  ...ethnicLayers,
                  ...riverLayers,
                  ...weatherLayers,
                  ...precisionRingLayers,
                  ...conflictLayers,
                  ...threatLayers,
                  ...entityLayers,
                  ...facilityLayers,
                ]
              : [
                  ...politicalLayers,
                  ...ethnicLayers,
                  ...riverLayers,
                  ...weatherLayers,
                  ...precisionRingLayers,
                  ...threatLayers,
                  ...conflictLayers,
                  ...entityLayers,
                  ...facilityLayers,
                ]
          }
          onHover={handleDeckHover}
          onClick={handleDeckClick}
          pickingRadius={12}
        />
        <CompassControl />
        <ProximityAlertOverlay />
        <FlyToHandler />
        {import.meta.env.DEV && <MapDevExposer />}
      </Map>
      <MapVignette />
      <MapLegend />
      <div className="absolute bottom-8 right-14 z-[var(--z-controls)] flex flex-col items-end gap-1">
        <UtcClock />
        <CoordinateReadout />
      </div>
      {tooltipEntity && <EntityTooltip entity={tooltipEntity} x={tooltipPos.x} y={tooltipPos.y} />}
      {!tooltipEntity && threatHover && (
        <ThreatTooltip zone={threatHover.zone} x={threatHover.x} y={threatHover.y} />
      )}
      {!tooltipEntity && !threatHover && ethnicHover && (
        <EthnicTooltip groups={ethnicHover.groups} x={ethnicHover.x} y={ethnicHover.y} />
      )}
      {!tooltipEntity && !threatHover && !ethnicHover && waterHover && (
        <div
          className="pointer-events-none absolute z-[var(--z-tooltip)]"
          style={{ left: waterHover.x + 12, top: waterHover.y - 12 }}
        >
          <div className="rounded bg-surface-overlay px-2 py-1.5 backdrop-blur-sm shadow-lg border border-border/50">
            <WaterTooltip
              facility={waterHover.facility}
              isAttacked={waterDestroyedIds.has(waterHover.facility.id)}
            />
          </div>
        </div>
      )}
      {!tooltipEntity && !threatHover && !ethnicHover && !waterHover && weatherHover && (
        <WeatherTooltip point={weatherHover.point} x={weatherHover.x} y={weatherHover.y} />
      )}
    </div>
  );
}
