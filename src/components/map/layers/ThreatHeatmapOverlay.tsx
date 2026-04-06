import { useMemo } from 'react';
import { ScatterplotLayer } from '@deck.gl/layers';
import { useLayerStore } from '@/stores/layerStore';
import { useFilterStore } from '@/stores/filterStore';
import { useFilteredEntities } from '@/hooks/useFilteredEntities';

import { TYPE_WEIGHTS } from '@/lib/severity';
import { CONFLICT_TOGGLE_GROUPS, EVENT_TYPE_LABELS } from '@/types/ui';
import type { ThreatCluster } from '@/types/ui';
import { LEGEND_REGISTRY } from '@/components/map/MapLegend';
import { RadialGradientExtension } from './RadialGradientExtension';
import type { ConflictEventEntity } from '@/types/entities';

// --- Constants ---

/** Grid cell size in degrees (~28km at equator) */
const CELL_SIZE_DEG = 0.25;

/**
 * 4-stop simplified thermal palette.
 * Deep purple -> magenta -> orange -> bright red.
 */
export const THERMAL_COLOR_RANGE: [number, number, number][] = [
  [80, 20, 120],     // deep purple (low threat)
  [180, 30, 100],    // magenta (moderate)
  [230, 120, 30],    // orange (high)
  [255, 40, 30],     // bright red (extreme)
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
  eventIds: string[];
  /** Sum of actual event latitudes (for true centroid, not grid-snapped). */
  realLatSum: number;
  /** Sum of actual event longitudes (for true centroid, not grid-snapped). */
  realLngSum: number;
}

// --- Pure functions ---

/**
 * Compute a threat weight for a single event.
 * Compounds type severity, media signal (mentions/sources),
 * fatalities, and Goldstein hostility. No temporal decay.
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

  return typeWeight * mediaFactor * fatalityFactor * goldsteinFactor;
}

/**
 * Compute the 90th percentile of an array of weights.
 * Returns at least 1 (floor clamp) to prevent degenerate colorDomain.
 */
export function computeP90(weights: number[]): number {
  if (weights.length === 0) return 1;
  const sorted = [...weights].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.9) - 1;
  return Math.max(sorted[Math.max(0, idx)] ?? 1, 1);
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
    eventIds: string[];
    // Actual event coordinate sums for true centroid computation
    realLatSum: number;
    realLngSum: number;
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
        goldsteinSum: 0, weightSum: 0, eventIds: [],
        realLatSum: 0, realLngSum: 0,
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
    cell.eventIds.push(event.id);
    cell.realLatSum += event.lat;
    cell.realLngSum += event.lng;
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
      eventIds: cell.eventIds,
      realLatSum: cell.realLatSum,
      realLngSum: cell.realLngSum,
    });
  }

  return result;
}

/**
 * Merge adjacent non-empty grid cells into connected-component clusters via BFS.
 * Uses integer grid indices as keys to avoid floating-point mismatch.
 */
export function mergeClusters(
  cells: ThreatZoneData[],
  cellSize = CELL_SIZE_DEG,
): ThreatCluster[] {
  if (cells.length === 0) return [];

  // Build a lookup by integer grid indices
  const cellMap = new Map<string, ThreatZoneData>();
  for (const cell of cells) {
    const row = Math.round(cell.lat / cellSize);
    const col = Math.round(cell.lng / cellSize);
    cellMap.set(`${row},${col}`, cell);
  }

  const visited = new Set<string>();
  const clusters: ThreatCluster[] = [];

  // 4-connected neighbors: N, S, E, W
  const NEIGHBORS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];

  for (const cell of cells) {
    const row = Math.round(cell.lat / cellSize);
    const col = Math.round(cell.lng / cellSize);
    const startKey = `${row},${col}`;
    if (visited.has(startKey)) continue;

    // BFS flood fill
    const component: ThreatZoneData[] = [];
    const queue = [startKey];
    visited.add(startKey);

    while (queue.length > 0) {
      const key = queue.shift()!;
      const c = cellMap.get(key)!;
      component.push(c);

      const [r, cIdx] = key.split(',').map(Number);
      for (const [dr, dc] of NEIGHBORS) {
        const nKey = `${r + dr},${cIdx + dc}`;
        if (!visited.has(nKey) && cellMap.has(nKey)) {
          visited.add(nKey);
          queue.push(nKey);
        }
      }
    }

    // Aggregate component into a ThreatCluster
    let totalWeight = 0;
    let eventCount = 0;
    let totalFatalities = 0;
    let latestTime = 0;
    let realLatSum = 0;
    let realLngSum = 0;
    const allEventIds: string[] = [];
    const typeCounts = new Map<string, number>();
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    for (const c of component) {
      totalWeight += c.clusterWeight;
      eventCount += c.eventCount;
      totalFatalities += c.totalFatalities;
      if (c.latestTime > latestTime) latestTime = c.latestTime;
      allEventIds.push(...c.eventIds);
      realLatSum += c.realLatSum;
      realLngSum += c.realLngSum;

      // Type counting
      typeCounts.set(c.dominantType, (typeCounts.get(c.dominantType) ?? 0) + c.eventCount);

      // Bounding box
      if (c.lat < minLat) minLat = c.lat;
      if (c.lat > maxLat) maxLat = c.lat;
      if (c.lng < minLng) minLng = c.lng;
      if (c.lng > maxLng) maxLng = c.lng;

    }

    // Dominant type across all cells
    let dominantType = '';
    let maxTypeCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > maxTypeCount) {
        maxTypeCount = count;
        dominantType = type;
      }
    }

    // Deterministic ID from sorted integer grid keys
    const sortedKeys = component
      .map((c) => {
        const r = Math.round(c.lat / cellSize);
        const cIdx = Math.round(c.lng / cellSize);
        return `${r},${cIdx}`;
      })
      .sort()
      .join(';');

    clusters.push({
      id: sortedKeys,
      centroidLat: eventCount > 0 ? realLatSum / eventCount : (minLat + maxLat) / 2,
      centroidLng: eventCount > 0 ? realLngSum / eventCount : (minLng + maxLng) / 2,
      cells: component,
      eventCount,
      totalWeight,
      dominantType,
      totalFatalities,
      latestTime,
      boundingBox: { minLat, maxLat, minLng, maxLng },
      eventIds: allEventIds,
    });
  }

  return clusters;
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

export function useThreatHeatmapLayers(hoveredClusterId: string | null = null, isBelowCrossover = true) {
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

    const grid = aggregateToGrid(filtered);
    const clusters = mergeClusters(grid);

    // P90 normalization for color interpolation
    const p90Weight = computeP90(clusters.map((c) => c.totalWeight));

    const clusterPickerLayer = new ScatterplotLayer({
      id: 'threat-cluster-picker',
      data: clusters,
      getPosition: (d: ThreatCluster) => [d.centroidLng, d.centroidLat],
      // Meter-based radius from bounding box diagonal + event density boost.
      // Stays geographically anchored to events on zoom. Dense clusters grow bigger.
      getRadius: (d: ThreatCluster) => {
        const { minLat, maxLat, minLng, maxLng } = d.boundingBox;
        const dLat = (maxLat - minLat) * 111_000; // ~111km per degree latitude
        const dLng = (maxLng - minLng) * 111_000 * Math.cos((d.centroidLat * Math.PI) / 180);
        const diagonal = Math.sqrt(dLat * dLat + dLng * dLng);
        // Base: full bounding box diagonal (generous coverage of cluster extent)
        const baseRadius = Math.max(diagonal, 30_000); // floor 30km for single-cell clusters
        // Density boost: sqrt of event count scales up packed clusters proportionally
        const densityFactor = 1 + Math.sqrt(d.eventCount) * 0.3;
        return baseRadius * densityFactor;
      },
      radiusUnits: 'meters' as const,
      radiusMinPixels: 20,
      radiusMaxPixels: 200,
      // Thermal color mapped from cluster weight via P90 normalization.
      // Alpha modulated by hover state: 255 (hovered), 102 (non-hovered when one is hovered), 180 (default).
      getFillColor: (d: ThreatCluster) => {
        const t = Math.min(1, d.totalWeight / p90Weight);
        const idx = Math.min(3, Math.floor(t * 4));
        const baseColor = THERMAL_COLOR_RANGE[idx];
        let alpha = isBelowCrossover ? 180 : 80;
        if (hoveredClusterId != null) {
          alpha = d.id === hoveredClusterId ? 255 : 102;
        }
        return [...baseColor, alpha] as [number, number, number, number];
      },
      pickable: isBelowCrossover,
      extensions: [new RadialGradientExtension()],
      parameters: {
        depthWriteEnabled: false,
        blendColorSrcFactor: 'src-alpha' as const,
        blendAlphaSrcFactor: 'src-alpha' as const,
        blendColorDstFactor: 'one' as const,
        blendAlphaDstFactor: 'one-minus-src-alpha' as const,
        blendColorOperation: 'add' as const,
        blendAlphaOperation: 'add' as const,
      },
      updateTriggers: {
        getFillColor: [hoveredClusterId, isBelowCrossover],
      },
    });

    return [clusterPickerLayer];
  }, [isActive, events, showAirstrikes, showGroundCombatToggle, showTargetedToggle, hoveredClusterId, isBelowCrossover]);
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
      <div className="rounded bg-surface-overlay px-2 py-1.5 text-xs text-text-primary backdrop-blur-sm shadow-lg min-w-[140px]">
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
    { color: '#501478', label: 'Low' },
    { color: '#ff281e', label: 'High' },
  ],
});
