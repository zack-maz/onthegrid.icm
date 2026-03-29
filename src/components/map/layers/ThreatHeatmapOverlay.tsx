import { useMemo } from 'react';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { ScatterplotLayer } from '@deck.gl/layers';
import { useLayerStore } from '@/stores/layerStore';
import { useFilterStore } from '@/stores/filterStore';
import { useFilteredEntities } from '@/hooks/useFilteredEntities';

import { TYPE_WEIGHTS } from '@/lib/severity';
import { CONFLICT_TOGGLE_GROUPS, EVENT_TYPE_LABELS } from '@/types/ui';
import { LEGEND_REGISTRY } from '@/components/map/MapLegend';
import type { ConflictEventEntity } from '@/types/entities';

// --- Constants ---

const HALF_LIFE_HOURS = 6;

/** Grid cell size in degrees (~83km at equator) */
const CELL_SIZE_DEG = 0.75;

const THREAT_COLOR_RANGE: [number, number, number][] = [
  [45, 0, 0],       // #2d0000 dark
  [139, 30, 30],    // #8b1e1e crimson
  [239, 68, 68],    // #ef4444 red
  [255, 59, 48],    // #ff3b30 bright
  [255, 107, 74],   // #ff6b4a white-hot core
];

// --- Types ---

export interface ThreatZoneData {
  lat: number;
  lng: number;
  eventCount: number;
  dominantType: string;
  latestTime: number;
  totalFatalities: number;
  totalMentions: number;
  totalSources: number;
  avgGoldstein: number;
  clusterWeight: number;
}

// --- Pure functions ---

/**
 * Compute a threat weight for a single event.
 * Compounds type severity, media signal (mentions/sources),
 * fatalities, Goldstein hostility, and temporal decay.
 */
export function computeThreatWeight(event: ConflictEventEntity): number {
  const typeWeight = TYPE_WEIGHTS[event.type] ?? 3;
  const mentions = event.data.numMentions ?? 1;
  const sources = event.data.numSources ?? 1;
  const fatalities = event.data.fatalities ?? 0;
  const goldstein = event.data.goldsteinScale ?? 0;

  // Media amplification (log-dampened)
  const mediaFactor = Math.log2(1 + mentions) * Math.log2(1 + sources);

  // Fatality boost: each death linearly amplifies
  const fatalityFactor = 1 + fatalities * 0.5;

  // Goldstein hostility: -10 (max conflict) → 2.0x, 0 → 1.5x, +10 → 1.0x
  const goldsteinFactor = 1.5 - goldstein / 20;

  // Temporal decay: exponential with 6h half-life
  const ageMs = Math.max(0, Date.now() - event.timestamp);
  const ageHours = ageMs / (1000 * 60 * 60);
  const decay = Math.pow(0.5, ageHours / HALF_LIFE_HOURS);

  return typeWeight * mediaFactor * fatalityFactor * goldsteinFactor * decay;
}

/**
 * Aggregate events into grid cells for tooltip picking.
 * Accumulates all tracked metrics per cell for rich cluster tooltips.
 */
export function aggregateToGrid(
  events: ConflictEventEntity[],
  cellSize = CELL_SIZE_DEG,
): ThreatZoneData[] {
  if (events.length === 0) return [];

  interface CellAcc {
    lat: number;
    lng: number;
    count: number;
    types: Map<string, number>;
    latest: number;
    fatalities: number;
    mentions: number;
    sources: number;
    goldsteinSum: number;
    weightSum: number;
  }

  const cells = new Map<string, CellAcc>();

  for (const event of events) {
    const cellLat = Math.floor(event.lat / cellSize) * cellSize + cellSize / 2;
    const cellLng = Math.floor(event.lng / cellSize) * cellSize + cellSize / 2;
    const key = `${cellLat},${cellLng}`;

    let cell = cells.get(key);
    if (!cell) {
      cell = {
        lat: cellLat, lng: cellLng, count: 0, types: new Map(),
        latest: 0, fatalities: 0, mentions: 0, sources: 0,
        goldsteinSum: 0, weightSum: 0,
      };
      cells.set(key, cell);
    }

    cell.count++;
    cell.types.set(event.type, (cell.types.get(event.type) ?? 0) + 1);
    if (event.timestamp > cell.latest) cell.latest = event.timestamp;
    cell.fatalities += event.data.fatalities ?? 0;
    cell.mentions += event.data.numMentions ?? 0;
    cell.sources += event.data.numSources ?? 0;
    cell.goldsteinSum += event.data.goldsteinScale ?? 0;
    cell.weightSum += computeThreatWeight(event);
  }

  const result: ThreatZoneData[] = [];
  for (const cell of cells.values()) {
    let dominantType = '';
    let maxCount = 0;
    for (const [type, count] of cell.types) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }

    result.push({
      lat: cell.lat,
      lng: cell.lng,
      eventCount: cell.count,
      dominantType,
      latestTime: cell.latest,
      totalFatalities: cell.fatalities,
      totalMentions: cell.mentions,
      totalSources: cell.sources,
      avgGoldstein: cell.count > 0 ? cell.goldsteinSum / cell.count : 0,
      clusterWeight: cell.weightSum,
    });
  }

  return result;
}

// --- Relative time helper ---

function formatRelativeTime(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// --- Hook ---

interface WeightedPoint {
  position: [number, number];
  weight: number;
}

export function useThreatHeatmapLayers() {
  // Consume events already filtered by useFilteredEntities (date, proximity, country, CAMEO, mentions, etc.)
  const { events } = useFilteredEntities();
  const isActive = useLayerStore((s) => s.activeLayers.has('threat'));

  // Visibility toggles (conflict category gating — not handled by useFilteredEntities)
  const showAirstrikes = useFilterStore((s) => s.showAirstrikes);
  const showGroundCombatToggle = useFilterStore((s) => s.showGroundCombat);
  const showTargetedToggle = useFilterStore((s) => s.showTargeted);

  return useMemo(() => {
    if (!isActive || events.length === 0) return [];

    const filtered = events.filter((e) => {
      if ((CONFLICT_TOGGLE_GROUPS.showAirstrikes as readonly string[]).includes(e.type)) return showAirstrikes;
      if ((CONFLICT_TOGGLE_GROUPS.showGroundCombat as readonly string[]).includes(e.type)) return showGroundCombatToggle;
      if ((CONFLICT_TOGGLE_GROUPS.showTargeted as readonly string[]).includes(e.type)) return showTargetedToggle;
      return false;
    });
    if (filtered.length === 0) return [];

    const weightedData: WeightedPoint[] = filtered.map((e) => ({
      position: [e.lng, e.lat] as [number, number],
      weight: computeThreatWeight(e),
    }));

    const heatmapLayer = new HeatmapLayer({
      id: 'threat-heatmap',
      data: weightedData,
      getPosition: (d: WeightedPoint) => d.position,
      getWeight: (d: WeightedPoint) => d.weight,
      radiusPixels: 40,
      colorRange: THREAT_COLOR_RANGE,
      intensity: 1,
      threshold: 0.05,
      opacity: 0.45,
      aggregation: 'SUM',
      pickable: false,
      debounceTimeout: 500,
    });

    const grid = aggregateToGrid(filtered);

    const pickerLayer = new ScatterplotLayer({
      id: 'threat-picker',
      data: grid,
      getPosition: (d: ThreatZoneData) => [d.lng, d.lat],
      getRadius: 50000,
      radiusUnits: 'meters' as const,
      getFillColor: [0, 0, 0, 0],
      pickable: true,
    });

    return [heatmapLayer, pickerLayer];
  }, [isActive, events, showAirstrikes, showGroundCombatToggle, showTargetedToggle]);
}

// --- Tooltip ---

interface ThreatTooltipProps {
  zone: ThreatZoneData;
  x: number;
  y: number;
}

/** Goldstein scale descriptor */
function goldsteinLabel(g: number): string {
  if (g <= -7) return 'Extreme';
  if (g <= -4) return 'High';
  if (g <= -1) return 'Elevated';
  return 'Moderate';
}

/**
 * Threat zone tooltip showing cluster-level intelligence summary.
 */
export function ThreatTooltip({ zone, x, y }: ThreatTooltipProps) {
  const typeLabel = EVENT_TYPE_LABELS[zone.dominantType] ?? zone.dominantType;
  const ago = formatRelativeTime(zone.latestTime);
  const hostility = goldsteinLabel(zone.avgGoldstein);

  return (
    <div
      className="pointer-events-none absolute z-[var(--z-tooltip)]"
      style={{ left: x + 12, top: y - 12 }}
    >
      <div className="rounded bg-surface-overlay/90 px-2 py-1.5 text-xs text-text-primary backdrop-blur-sm shadow-lg min-w-[140px]">
        <div className="mb-0.5 text-[9px] uppercase tracking-wider text-text-muted">
          Threat Cluster
        </div>
        <div className="flex justify-between gap-3">
          <span>{zone.eventCount} events</span>
          <span className="text-text-muted">{ago}</span>
        </div>
        <div>Mostly {typeLabel}</div>
        {zone.totalFatalities > 0 && (
          <div className="text-red-400">{zone.totalFatalities} fatalities</div>
        )}
        <div className="mt-0.5 border-t border-white/10 pt-0.5 text-[10px] text-text-muted">
          <span>{hostility} hostility</span>
          <span className="mx-1">&middot;</span>
          <span>{zone.totalMentions} mentions</span>
        </div>
      </div>
    </div>
  );
}

// --- Legend registration (module scope) ---

LEGEND_REGISTRY.push({
  layerId: 'threat',
  title: 'Threat Density',
  colorStops: [
    { color: '#2d0000', label: 'Low' },
    { color: '#ff3b30', label: 'High' },
  ],
});
