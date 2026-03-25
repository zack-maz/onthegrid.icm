import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import {
  useThreatHeatmapLayers,
  ThreatTooltip,
  computeThreatWeight,
  aggregateToGrid,
} from '@/components/map/layers/ThreatHeatmapOverlay';
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
  // Formula: typeWeight * mediaFactor * fatalityFactor * goldsteinFactor * decay
  // With default test event: numMentions=undefined(->1), numSources=undefined(->1),
  // fatalities=0, goldsteinScale=-5
  // mediaFactor = log2(2) * log2(2) = 1
  // fatalityFactor = 1
  // goldsteinFactor = 1.5 - (-5)/20 = 1.75
  // For airstrike (typeWeight=10): 10 * 1 * 1 * 1.75 = 17.5

  it('returns full weight for events with timestamp = now', () => {
    const event = makeEvent({ type: 'airstrike', timestamp: Date.now() });
    const weight = computeThreatWeight(event);
    // airstrike=10, media=1, fatality=1, goldstein=1.75, decay=1.0
    expect(weight).toBeCloseTo(17.5, 0);
  });

  it('returns ~50% weight for events 6 hours old (half-life)', () => {
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    const event = makeEvent({ type: 'airstrike', timestamp: sixHoursAgo });
    const weight = computeThreatWeight(event);
    // 17.5 * 0.5 = 8.75
    expect(weight).toBeCloseTo(8.75, 0);
  });

  it('returns ~25% weight for events 12 hours old', () => {
    const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
    const event = makeEvent({ type: 'airstrike', timestamp: twelveHoursAgo });
    const weight = computeThreatWeight(event);
    // 17.5 * 0.25 = 4.375
    expect(weight).toBeCloseTo(4.375, 0);
  });

  it('uses default weight of 3 for unknown event types', () => {
    const event = makeEvent({ type: 'unknown_type' as ConflictEventEntity['type'], timestamp: Date.now() });
    const weight = computeThreatWeight(event);
    // 3 * 1 * 1 * 1.75 = 5.25
    expect(weight).toBeCloseTo(5.25, 0);
  });
});

describe('aggregateToGrid', () => {
  it('returns empty array for empty events input', () => {
    const result = aggregateToGrid([]);
    expect(result).toEqual([]);
  });

  it('groups events into 0.75-degree cells with count, dominant type, and latest timestamp', () => {
    const now = Date.now();
    // All events within the same 0.75-degree cell: floor(33.1/0.75)=44, floor(44.5/0.75)=59
    const events = [
      makeEvent({ type: 'airstrike', lat: 33.1, lng: 44.5, timestamp: now - 1000 }),
      makeEvent({ type: 'airstrike', lat: 33.6, lng: 44.6, timestamp: now }),
      makeEvent({ type: 'shelling', lat: 33.4, lng: 44.7, timestamp: now - 5000 }),
    ];
    const result = aggregateToGrid(events);
    expect(result).toHaveLength(1);
    expect(result[0].eventCount).toBe(3);
    expect(result[0].dominantType).toBe('airstrike'); // 2 airstrikes vs 1 shelling
    expect(result[0].latestTime).toBe(now);
  });

  it('computes dominant type as the most frequent event type in the cell', () => {
    const events = [
      makeEvent({ type: 'shelling', lat: 33.2, lng: 44.3 }),
      makeEvent({ type: 'shelling', lat: 33.7, lng: 44.8 }),
      makeEvent({ type: 'shelling', lat: 33.5, lng: 44.1 }),
      makeEvent({ type: 'airstrike', lat: 33.3, lng: 44.5 }),
    ];
    const result = aggregateToGrid(events);
    expect(result[0].dominantType).toBe('shelling');
  });

  it('separates events in different cells', () => {
    const events = [
      makeEvent({ type: 'airstrike', lat: 33.2, lng: 44.3 }),
      makeEvent({ type: 'bombing', lat: 35.5, lng: 50.5 }),
    ];
    const result = aggregateToGrid(events);
    expect(result).toHaveLength(2);
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
    expect(result.current[1].id).toBe('threat-picker');
  });

  it('HeatmapLayer has correct configuration', () => {
    const events = [makeEvent({ type: 'airstrike', lat: 33.0, lng: 44.0 })];
    useEventStore.setState({ events, eventCount: events.length });
    useLayerStore.getState().toggleLayer('threat');
    const { result } = renderHook(() => useThreatHeatmapLayers());
    const heatmap = result.current[0];
    expect(heatmap.id).toBe('threat-heatmap');
    expect(heatmap.props.pickable).toBe(false);
    expect(heatmap.props.opacity).toBe(0.45);
    expect(heatmap.props.colorRange).toEqual([
      [45, 0, 0],
      [139, 30, 30],
      [239, 68, 68],
      [255, 59, 48],
      [255, 107, 74],
    ]);
  });

  it('ScatterplotLayer has correct configuration', () => {
    const events = [makeEvent({ type: 'airstrike', lat: 33.0, lng: 44.0 })];
    useEventStore.setState({ events, eventCount: events.length });
    useLayerStore.getState().toggleLayer('threat');
    const { result } = renderHook(() => useThreatHeatmapLayers());
    const picker = result.current[1];
    expect(picker.id).toBe('threat-picker');
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
        }}
        x={0}
        y={0}
      />,
    );
    expect(screen.getByText('Moderate hostility')).toBeTruthy();
  });
});

describe('LEGEND_REGISTRY threat entry', () => {
  it('includes a threat entry with title Threat Density', () => {
    const threatLegend = LEGEND_REGISTRY.find((l) => l.layerId === 'threat');
    expect(threatLegend).toBeTruthy();
    expect(threatLegend!.title).toBe('Threat Density');
    expect(threatLegend!.colorStops).toEqual([
      { color: '#2d0000', label: 'Low' },
      { color: '#ff3b30', label: 'High' },
    ]);
  });
});
