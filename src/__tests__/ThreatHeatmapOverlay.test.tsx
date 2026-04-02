import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import {
  useThreatHeatmapLayers,
  ThreatTooltip,
  computeThreatWeight,
  aggregateToGrid,
  computeP90,
  mergeClusters,
  THERMAL_COLOR_RANGE,
} from '@/components/map/layers/ThreatHeatmapOverlay';
import type { ThreatCluster } from '@/types/ui';
import { useEventStore } from '@/stores/eventStore';
import { useLayerStore } from '@/stores/layerStore';
import { useFilterStore } from '@/stores/filterStore';
import { LEGEND_REGISTRY } from '@/components/map/MapLegend';
import type { ConflictEventEntity } from '@/types/entities';

function makeEvent(
  overrides: Partial<ConflictEventEntity> & { type: ConflictEventEntity['type'] },
): ConflictEventEntity {
  return {
    id: `event-${Math.random().toString(36).slice(2)}`,
    lat: 33.0,
    lng: 44.0,
    timestamp: Date.now(),
    label: 'Test event',
    data: {
      eventType: 'Test',
      subEventType: '',
      fatalities: 0,
      actor1: 'A',
      actor2: 'B',
      notes: '',
      source: 'https://example.com',
      goldsteinScale: -5,
      locationName: 'Test',
      cameoCode: '190',
    },
    ...overrides,
  };
}

describe('computeThreatWeight', () => {
  // Formula (no decay): typeWeight * mediaFactor * fatalityFactor * goldsteinFactor
  // With default test event: numMentions=undefined(->1), numSources=undefined(->1),
  // fatalities=0, goldsteinScale=-5
  // mediaFactor = log2(2) * log2(2) = 1
  // fatalityFactor = 1
  // goldsteinFactor = 1.5 - (-5)/20 = 1.75
  // For airstrike (typeWeight=10): 10 * 1 * 1 * 1.75 = 17.5

  it('returns full weight for events with timestamp = now', () => {
    const event = makeEvent({ type: 'airstrike', timestamp: Date.now() });
    const weight = computeThreatWeight(event);
    // airstrike=10, media=1, fatality=1, goldstein=1.75, no decay
    expect(weight).toBeCloseTo(17.5, 0);
  });

  it('returns identical weight regardless of event age (no temporal decay)', () => {
    const now = Date.now();
    const sixHoursAgo = now - 6 * 60 * 60 * 1000;
    const eventNow = makeEvent({ type: 'airstrike', timestamp: now });
    const eventOld = makeEvent({ type: 'airstrike', timestamp: sixHoursAgo });
    const weightNow = computeThreatWeight(eventNow);
    const weightOld = computeThreatWeight(eventOld);
    expect(weightNow).toBe(weightOld);
  });

  it('uses default weight of 3 for unknown event types', () => {
    const event = makeEvent({ type: 'unknown_type' as ConflictEventEntity['type'], timestamp: Date.now() });
    const weight = computeThreatWeight(event);
    // 3 * 1 * 1 * 1.75 = 5.25 (no decay)
    expect(weight).toBeCloseTo(5.25, 0);
  });
});

describe('aggregateToGrid', () => {
  it('returns empty array for empty events input', () => {
    const result = aggregateToGrid([]);
    expect(result).toEqual([]);
  });

  it('groups events into 0.25-degree cells with count, dominant type, and latest timestamp', () => {
    const now = Date.now();
    // All events within the same 0.25-degree cell: floor(33.1/0.25)=132, floor(44.5/0.25)=178
    // lat 33.1 and 33.2 both in cell 132 (33.0-33.25)
    const events = [
      makeEvent({ type: 'airstrike', lat: 33.1, lng: 44.5, timestamp: now - 1000 }),
      makeEvent({ type: 'airstrike', lat: 33.2, lng: 44.5, timestamp: now }),
      makeEvent({ type: 'shelling', lat: 33.15, lng: 44.55, timestamp: now - 5000 }),
    ];
    const result = aggregateToGrid(events);
    expect(result).toHaveLength(1);
    expect(result[0].eventCount).toBe(3);
    expect(result[0].dominantType).toBe('airstrike'); // 2 airstrikes vs 1 shelling
    expect(result[0].latestTime).toBe(now);
  });

  it('separates events across 0.25-degree cell boundaries', () => {
    // lat 33.1 -> cell floor(33.1/0.25)=132 (center 33.125)
    // lat 33.6 -> cell floor(33.6/0.25)=134 (center 33.625)
    const events = [
      makeEvent({ type: 'airstrike', lat: 33.1, lng: 44.3 }),
      makeEvent({ type: 'bombing', lat: 33.6, lng: 44.3 }),
    ];
    const result = aggregateToGrid(events);
    expect(result).toHaveLength(2);
  });

  it('computes dominant type as the most frequent event type in the cell', () => {
    // All in same 0.25-degree cell (lat ~33.1 range)
    const events = [
      makeEvent({ type: 'shelling', lat: 33.1, lng: 44.1 }),
      makeEvent({ type: 'shelling', lat: 33.15, lng: 44.15 }),
      makeEvent({ type: 'shelling', lat: 33.2, lng: 44.2 }),
      makeEvent({ type: 'airstrike', lat: 33.12, lng: 44.12 }),
    ];
    const result = aggregateToGrid(events);
    expect(result[0].dominantType).toBe('shelling');
  });

  it('populates eventIds with correct event IDs for each cell', () => {
    const e1 = makeEvent({ id: 'evt-001', type: 'airstrike', lat: 33.1, lng: 44.1 });
    const e2 = makeEvent({ id: 'evt-002', type: 'shelling', lat: 33.15, lng: 44.15 });
    const e3 = makeEvent({ id: 'evt-003', type: 'bombing', lat: 35.5, lng: 50.5 }); // different cell
    const result = aggregateToGrid([e1, e2, e3]);
    expect(result).toHaveLength(2);

    // Find the cell containing e1 and e2
    const cell1 = result.find((r) => r.eventCount === 2);
    expect(cell1).toBeTruthy();
    expect(cell1!.eventIds).toContain('evt-001');
    expect(cell1!.eventIds).toContain('evt-002');
    expect(cell1!.eventIds).toHaveLength(2);

    // Find the cell containing e3
    const cell2 = result.find((r) => r.eventCount === 1);
    expect(cell2).toBeTruthy();
    expect(cell2!.eventIds).toEqual(['evt-003']);
  });

  it('separates events in widely different cells', () => {
    const events = [
      makeEvent({ type: 'airstrike', lat: 33.2, lng: 44.3 }),
      makeEvent({ type: 'bombing', lat: 35.5, lng: 50.5 }),
    ];
    const result = aggregateToGrid(events);
    expect(result).toHaveLength(2);
  });
});

describe('computeP90', () => {
  it('returns 1 for empty array', () => {
    expect(computeP90([])).toBe(1);
  });

  it('returns 9 for [1..10]', () => {
    expect(computeP90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9);
  });

  it('returns the value for all-same values (clamped to min 1)', () => {
    expect(computeP90([5, 5, 5, 5, 5])).toBe(5);
  });

  it('returns at least 1 for very small values (floor clamp)', () => {
    expect(computeP90([0.1, 0.1, 0.1])).toBeGreaterThanOrEqual(1);
  });

  it('returns the element for single-element array (if >= 1)', () => {
    expect(computeP90([7])).toBe(7);
  });

  it('returns 1 for single element below 1', () => {
    expect(computeP90([0.5])).toBe(1);
  });
});

describe('mergeClusters', () => {
  const CELL_SIZE = 0.25;

  function makeCell(lat: number, lng: number, overrides: Partial<import('@/components/map/layers/ThreatHeatmapOverlay').ThreatZoneData> = {}): import('@/components/map/layers/ThreatHeatmapOverlay').ThreatZoneData {
    return {
      lat,
      lng,
      eventCount: 1,
      dominantType: 'airstrike',
      latestTime: Date.now(),
      totalFatalities: 0,
      totalMentions: 1,
      totalSources: 1,
      avgGoldstein: -5,
      clusterWeight: 10,
      eventIds: [`evt-${lat}-${lng}`],
      ...overrides,
    };
  }

  it('returns 1 cluster for a single isolated cell', () => {
    const cells = [makeCell(33.125, 44.125)];
    const clusters = mergeClusters(cells, CELL_SIZE);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].cells).toHaveLength(1);
    expect(clusters[0].eventCount).toBe(1);
  });

  it('merges 2 adjacent cells (N-S neighbors at 0.25-deg) into 1 cluster', () => {
    // Cell centers 0.25 degrees apart in latitude
    const cells = [
      makeCell(33.125, 44.125),
      makeCell(33.375, 44.125),
    ];
    const clusters = mergeClusters(cells, CELL_SIZE);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].cells).toHaveLength(2);
    expect(clusters[0].eventCount).toBe(2);
  });

  it('returns 2 separate clusters for 2 non-adjacent cells', () => {
    // Cells 2 grid steps apart (not neighbors)
    const cells = [
      makeCell(33.125, 44.125),
      makeCell(33.625, 44.125), // 2 cells apart in lat
    ];
    const clusters = mergeClusters(cells, CELL_SIZE);
    expect(clusters).toHaveLength(2);
  });

  it('merges L-shaped group of 3 cells into 1 cluster', () => {
    const cells = [
      makeCell(33.125, 44.125),  // bottom-left
      makeCell(33.375, 44.125),  // above it
      makeCell(33.375, 44.375),  // to its right
    ];
    const clusters = mergeClusters(cells, CELL_SIZE);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].cells).toHaveLength(3);
  });

  it('computes correct eventCount as sum of cell event counts', () => {
    const cells = [
      makeCell(33.125, 44.125, { eventCount: 5 }),
      makeCell(33.375, 44.125, { eventCount: 3 }),
    ];
    const clusters = mergeClusters(cells, CELL_SIZE);
    expect(clusters[0].eventCount).toBe(8);
  });

  it('computes weight-averaged centroid', () => {
    const cells = [
      makeCell(33.125, 44.125, { clusterWeight: 10 }),
      makeCell(33.375, 44.125, { clusterWeight: 30 }),
    ];
    const clusters = mergeClusters(cells, CELL_SIZE);
    // Weighted average: (33.125*10 + 33.375*30) / 40 = (331.25 + 1001.25) / 40 = 33.3125
    expect(clusters[0].centroidLat).toBeCloseTo(33.3125, 4);
    expect(clusters[0].centroidLng).toBeCloseTo(44.125, 4);
  });

  it('computes correct eventIds as union of all cell eventIds', () => {
    const cells = [
      makeCell(33.125, 44.125, { eventIds: ['a', 'b'] }),
      makeCell(33.375, 44.125, { eventIds: ['c'] }),
    ];
    const clusters = mergeClusters(cells, CELL_SIZE);
    expect(clusters[0].eventIds).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(clusters[0].eventIds).toHaveLength(3);
  });

  it('computes correct boundingBox', () => {
    const cells = [
      makeCell(33.125, 44.125),
      makeCell(33.375, 44.375),
    ];
    const clusters = mergeClusters(cells, CELL_SIZE);
    expect(clusters[0].boundingBox).toEqual({
      minLat: 33.125,
      maxLat: 33.375,
      minLng: 44.125,
      maxLng: 44.375,
    });
  });

  it('produces deterministic id based on sorted cell coordinates', () => {
    // Same cells in different order should produce same id
    const cells1 = [
      makeCell(33.375, 44.125),
      makeCell(33.125, 44.125),
    ];
    const cells2 = [
      makeCell(33.125, 44.125),
      makeCell(33.375, 44.125),
    ];
    const clusters1 = mergeClusters(cells1, CELL_SIZE);
    const clusters2 = mergeClusters(cells2, CELL_SIZE);
    expect(clusters1[0].id).toBe(clusters2[0].id);
  });

  it('returns empty array for empty input', () => {
    expect(mergeClusters([], CELL_SIZE)).toEqual([]);
  });
});

describe('THERMAL_COLOR_RANGE', () => {
  it('has exactly 8 stops', () => {
    expect(THERMAL_COLOR_RANGE).toHaveLength(8);
  });

  it('contains RGB tuples', () => {
    for (const stop of THERMAL_COLOR_RANGE) {
      expect(stop).toHaveLength(3);
      for (const ch of stop) {
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe('useThreatHeatmapLayers', () => {
  beforeEach(() => {
    useEventStore.setState({ events: [], connectionStatus: 'loading', lastFetchAt: null, eventCount: 0 });
    useLayerStore.getState().resetLayers();
    // Set date range to include current time (default snaps to hour boundary which may exclude Date.now())
    useFilterStore.setState({ dateStart: Date.now() - 48 * 60 * 60 * 1000, dateEnd: Date.now() + 60000 });
  });

  it('returns empty array when layer is inactive', () => {
    const events = [makeEvent({ type: 'airstrike' })];
    useEventStore.setState({ events, eventCount: events.length });
    // threat layer NOT active
    const { result } = renderHook(() => useThreatHeatmapLayers());
    expect(result.current).toEqual([]);
  });

  it('returns empty array when events are empty', () => {
    useLayerStore.getState().toggleLayer('threat');
    const { result } = renderHook(() => useThreatHeatmapLayers());
    expect(result.current).toEqual([]);
  });

  it('returns HeatmapLayer + ScatterplotLayer when active with events', () => {
    const events = [makeEvent({ type: 'airstrike', lat: 33.0, lng: 44.0 })];
    useEventStore.setState({ events, eventCount: events.length });
    useLayerStore.getState().toggleLayer('threat');
    const { result } = renderHook(() => useThreatHeatmapLayers());
    expect(result.current).toHaveLength(2);
    expect(result.current[0].id).toBe('threat-heatmap');
    expect(result.current[1].id).toBe('threat-cluster-picker');
  });

  it('HeatmapLayer has correct configuration with thermal palette', () => {
    const events = [makeEvent({ type: 'airstrike', lat: 33.0, lng: 44.0 })];
    useEventStore.setState({ events, eventCount: events.length });
    useLayerStore.getState().toggleLayer('threat');
    const { result } = renderHook(() => useThreatHeatmapLayers());
    const heatmap = result.current[0];
    expect(heatmap.id).toBe('threat-heatmap');
    expect(heatmap.props.pickable).toBe(false);
    expect(heatmap.props.opacity).toBe(0.45);
    expect(heatmap.props.colorRange).toEqual(THERMAL_COLOR_RANGE);
  });

  it('HeatmapLayer has colorDomain set', () => {
    const events = [makeEvent({ type: 'airstrike', lat: 33.0, lng: 44.0 })];
    useEventStore.setState({ events, eventCount: events.length });
    useLayerStore.getState().toggleLayer('threat');
    const { result } = renderHook(() => useThreatHeatmapLayers());
    const heatmap = result.current[0];
    expect(heatmap.props.colorDomain).toBeDefined();
    expect(Array.isArray(heatmap.props.colorDomain)).toBe(true);
    expect(heatmap.props.colorDomain[0]).toBe(0);
    expect(heatmap.props.colorDomain[1]).toBeGreaterThan(0);
  });

  it('ScatterplotLayer has correct configuration with cluster-level data', () => {
    const events = [makeEvent({ type: 'airstrike', lat: 33.0, lng: 44.0 })];
    useEventStore.setState({ events, eventCount: events.length });
    useLayerStore.getState().toggleLayer('threat');
    const { result } = renderHook(() => useThreatHeatmapLayers());
    const picker = result.current[1];
    expect(picker.id).toBe('threat-cluster-picker');
    expect(picker.props.pickable).toBe(true);
    expect(picker.props.getFillColor).toEqual([0, 0, 0, 0]);
  });
});

describe('ThreatTooltip', () => {
  it('renders event count, dominant event type label, and relative time', () => {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    render(
      <ThreatTooltip
        zone={{
          lat: 33, lng: 44, eventCount: 12, dominantType: 'airstrike', latestTime: fiveMinAgo,
          totalFatalities: 0, totalMentions: 45, totalSources: 8, avgGoldstein: -5, clusterWeight: 50,
          eventIds: [],
        }}
        x={100}
        y={100}
      />,
    );
    expect(screen.getByText('Threat Cluster')).toBeTruthy();
    expect(screen.getByText('12 events')).toBeTruthy();
    expect(screen.getByText('Mostly Airstrike')).toBeTruthy();
    // Should show relative time (e.g. "5m ago")
    expect(screen.getByText(/\d+m ago/)).toBeTruthy();
    // Should show hostility level and mentions
    expect(screen.getByText(/hostility/)).toBeTruthy();
    expect(screen.getByText('45 mentions')).toBeTruthy();
  });

  it('shows hours for older events', () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    render(
      <ThreatTooltip
        zone={{
          lat: 33, lng: 44, eventCount: 3, dominantType: 'ground_combat', latestTime: twoHoursAgo,
          totalFatalities: 5, totalMentions: 10, totalSources: 3, avgGoldstein: -8, clusterWeight: 30,
          eventIds: [],
        }}
        x={50}
        y={50}
      />,
    );
    expect(screen.getByText('Mostly Ground Combat')).toBeTruthy();
    expect(screen.getByText(/\d+h ago/)).toBeTruthy();
    // Should show fatalities when > 0
    expect(screen.getByText('5 fatalities')).toBeTruthy();
  });

  it('renders fatalities row only when totalFatalities > 0', () => {
    const recent = Date.now() - 60_000;
    const { container } = render(
      <ThreatTooltip
        zone={{
          lat: 33, lng: 44, eventCount: 2, dominantType: 'shelling', latestTime: recent,
          totalFatalities: 0, totalMentions: 5, totalSources: 2, avgGoldstein: -3, clusterWeight: 10,
          eventIds: [],
        }}
        x={0}
        y={0}
      />,
    );
    expect(container.textContent).not.toContain('fatalities');
  });

  it('shows extreme hostility for avgGoldstein <= -7', () => {
    render(
      <ThreatTooltip
        zone={{
          lat: 33, lng: 44, eventCount: 1, dominantType: 'airstrike', latestTime: Date.now(),
          totalFatalities: 0, totalMentions: 1, totalSources: 1, avgGoldstein: -9, clusterWeight: 10,
          eventIds: [],
        }}
        x={0}
        y={0}
      />,
    );
    expect(screen.getByText('Extreme hostility')).toBeTruthy();
  });

  it('shows elevated hostility for avgGoldstein between -4 and -1', () => {
    render(
      <ThreatTooltip
        zone={{
          lat: 33, lng: 44, eventCount: 1, dominantType: 'bombing', latestTime: Date.now(),
          totalFatalities: 0, totalMentions: 1, totalSources: 1, avgGoldstein: -2, clusterWeight: 10,
          eventIds: [],
        }}
        x={0}
        y={0}
      />,
    );
    expect(screen.getByText('Elevated hostility')).toBeTruthy();
  });

  it('shows moderate hostility for avgGoldstein > -1', () => {
    render(
      <ThreatTooltip
        zone={{
          lat: 33, lng: 44, eventCount: 1, dominantType: 'assault', latestTime: Date.now(),
          totalFatalities: 0, totalMentions: 1, totalSources: 1, avgGoldstein: 0, clusterWeight: 5,
          eventIds: [],
        }}
        x={0}
        y={0}
      />,
    );
    expect(screen.getByText('Moderate hostility')).toBeTruthy();
  });
});

describe('LEGEND_REGISTRY threat entry', () => {
  it('includes a threat entry with thermal palette colors', () => {
    const threatLegend = LEGEND_REGISTRY.find((l) => l.layerId === 'threat');
    expect(threatLegend).toBeTruthy();
    expect(threatLegend!.title).toBe('Threat Density');
    // Should use thermal palette endpoint colors (not old red palette)
    expect(threatLegend!.colorStops[0].label).toBe('Low');
    expect(threatLegend!.colorStops[1].label).toBe('High');
    // Colors should NOT be the old red palette
    expect(threatLegend!.colorStops[0].color).not.toBe('#2d0000');
    expect(threatLegend!.colorStops[1].color).not.toBe('#ff3b30');
  });
});
