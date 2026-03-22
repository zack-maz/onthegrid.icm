import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useFlightStore } from '@/stores/flightStore';
import { useEventStore } from '@/stores/eventStore';
import { useShipStore } from '@/stores/shipStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { CountersSlot } from '@/components/layout/CountersSlot';
import type { FlightEntity, ConflictEventEntity } from '@/types/entities';
import type { ConflictEventType } from '@/types/ui';

function makeFlight(id: string, country: string, unidentified = false): FlightEntity {
  return {
    id, type: 'flight', lat: 32, lng: 51, timestamp: Date.now(), label: id,
    data: { icao24: id, callsign: id, originCountry: country, velocity: 250, heading: 45, altitude: 10000, onGround: false, verticalRate: 0, unidentified },
  };
}

function makeEvent(id: string, type: ConflictEventType, fatalities = 0): ConflictEventEntity {
  return {
    id, type, lat: 32, lng: 51, timestamp: Date.now(), label: id,
    data: { eventType: '', subEventType: '', fatalities, actor1: '', actor2: '', notes: '', source: '', goldsteinScale: 0, locationName: '', cameoCode: '' },
  };
}

describe('CountersSlot', () => {
  beforeEach(() => {
    useFlightStore.setState({ flights: [], flightCount: 0, connectionStatus: 'connected' });
    useEventStore.setState({ events: [], eventCount: 0, connectionStatus: 'connected' });
    useShipStore.setState({ ships: [], shipCount: 0, connectionStatus: 'connected' });
    useUIStore.setState({
      isCountersCollapsed: false,
      showEvents: true,
      showAirstrikes: true,
      showGroundCombat: true,
      showTargeted: true,
      showFlights: true,
      showShips: true,
      showGroundTraffic: false,
      pulseEnabled: true,
      selectedEntityId: null,
    });
    useFilterStore.setState({
      flightCountries: [],
      eventCountries: [],
      flightSpeedMin: null,
      flightSpeedMax: null,
      shipSpeedMin: null,
      shipSpeedMax: null,
      altitudeMin: null,
      altitudeMax: null,
      proximityPin: null,
      proximityRadiusKm: 100,
      dateStart: null,
      dateEnd: null,
      isSettingPin: false,
    });
  });

  it('renders FLIGHTS section header', () => {
    render(<CountersSlot />);
    expect(screen.getByText('Flights')).toBeInTheDocument();
  });

  it('renders EVENTS section header', () => {
    render(<CountersSlot />);
    expect(screen.getByText('Events')).toBeInTheDocument();
  });

  it('renders all counter row labels', () => {
    render(<CountersSlot />);
    expect(screen.getByText('Iranian')).toBeInTheDocument();
    expect(screen.getByText('Unidentified')).toBeInTheDocument();
    expect(screen.getByText('Airstrikes')).toBeInTheDocument();
    expect(screen.getByText('Ground Combat')).toBeInTheDocument();
    expect(screen.getByText('Targeted')).toBeInTheDocument();
    expect(screen.getAllByText('Ships').length).toBeGreaterThan(0);
  });

  it('shows plain counts for events (no ratios)', () => {
    useEventStore.setState({
      events: [
        makeEvent('a1', 'airstrike'),
        makeEvent('a2', 'airstrike'),
      ],
      eventCount: 2,
    });
    render(<CountersSlot />);

    // Airstrikes = 2, should show just "2" with no ratio
    const values = screen.getAllByText('2');
    expect(values.length).toBeGreaterThan(0);
  });

  it('flight counters show simple counts', () => {
    useFlightStore.setState({
      flights: [
        makeFlight('f1', 'Iran'),
        makeFlight('f2', 'Iran'),
        makeFlight('f3', 'Qatar', true),
      ],
      flightCount: 3,
    });
    render(<CountersSlot />);

    // Iranian = 2, Unidentified = 1
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('hides content when collapsed', () => {
    useUIStore.setState({ isCountersCollapsed: true });
    render(<CountersSlot />);

    expect(screen.queryByText('Flights')).not.toBeInTheDocument();
    expect(screen.queryByText('Events')).not.toBeInTheDocument();
  });

  // --- New tests for expandable dropdown behavior ---

  it('clicking a counter row with entities > 0 expands it', () => {
    useFlightStore.setState({
      flights: [makeFlight('f1', 'Unknown', true)],
      flightCount: 1,
    });
    render(<CountersSlot />);

    // Unidentified row has entities, click to expand
    const buttons = screen.getAllByTestId('counter-row-button');
    // Find the Unidentified button
    const unidentifiedBtn = buttons.find(
      (btn) => btn.textContent?.includes('Unidentified'),
    );
    expect(unidentifiedBtn).toBeDefined();
    fireEvent.click(unidentifiedBtn!);

    // Should show entity list items
    const items = screen.getAllByTestId('entity-list-item');
    expect(items.length).toBe(1);
  });

  it('accordion: expanding a second row collapses the first', () => {
    useFlightStore.setState({
      flights: [makeFlight('f1', 'Unknown', true)],
      flightCount: 1,
    });
    useEventStore.setState({
      events: [makeEvent('e1', 'airstrike')],
      eventCount: 1,
    });
    render(<CountersSlot />);

    const buttons = screen.getAllByTestId('counter-row-button');
    const unidentifiedBtn = buttons.find(
      (btn) => btn.textContent?.includes('Unidentified'),
    );
    const airstrikesBtn = buttons.find(
      (btn) => btn.textContent?.includes('Airstrikes'),
    );

    // Expand unidentified
    fireEvent.click(unidentifiedBtn!);
    let items = screen.getAllByTestId('entity-list-item');
    expect(items.length).toBe(1);

    // Expand airstrikes -- unidentified should collapse
    fireEvent.click(airstrikesBtn!);
    items = screen.getAllByTestId('entity-list-item');
    // Should still be exactly 1 item (just the airstrike now)
    expect(items.length).toBe(1);
  });

  it('counter row with value 0 has disabled styling and no chevron', () => {
    // No flights, no events -- all zero
    render(<CountersSlot />);

    const buttons = screen.getAllByTestId('counter-row-button');
    const unidentifiedBtn = buttons.find(
      (btn) => btn.textContent?.includes('Unidentified'),
    );
    expect(unidentifiedBtn).toBeDefined();
    expect(unidentifiedBtn!.className).toContain('opacity-40');
    expect(unidentifiedBtn!.className).toContain('pointer-events-none');

    // No chevron SVG in the disabled button
    const svg = unidentifiedBtn!.querySelector('svg');
    expect(svg).toBeNull();
  });

  it('expanded dropdown with entities shows entity labels', () => {
    useFlightStore.setState({
      flights: [
        makeFlight('abc123', 'Unknown', true),
        makeFlight('def456', 'Unknown', true),
      ],
      flightCount: 2,
    });
    render(<CountersSlot />);

    const buttons = screen.getAllByTestId('counter-row-button');
    const unidentifiedBtn = buttons.find(
      (btn) => btn.textContent?.includes('Unidentified'),
    );
    fireEvent.click(unidentifiedBtn!);

    // Entity labels should be visible (icao24 used as label for unidentified)
    expect(screen.getByText('abc123')).toBeInTheDocument();
    expect(screen.getByText('def456')).toBeInTheDocument();
  });

  it('clicking an entity calls selectEntity and openDetailPanel', () => {
    useFlightStore.setState({
      flights: [makeFlight('f1', 'Unknown', true)],
      flightCount: 1,
    });
    const selectEntitySpy = vi.fn();
    const openDetailPanelSpy = vi.fn();
    const setFlyToTargetSpy = vi.fn();

    // Spy on store methods
    useUIStore.setState({
      selectEntity: selectEntitySpy,
      openDetailPanel: openDetailPanelSpy,
    });
    useNotificationStore.setState({
      setFlyToTarget: setFlyToTargetSpy,
    });

    render(<CountersSlot />);

    // Expand unidentified row
    const buttons = screen.getAllByTestId('counter-row-button');
    const unidentifiedBtn = buttons.find(
      (btn) => btn.textContent?.includes('Unidentified'),
    );
    fireEvent.click(unidentifiedBtn!);

    // Click the entity
    const entityItem = screen.getByTestId('entity-list-item');
    fireEvent.click(entityItem);

    expect(selectEntitySpy).toHaveBeenCalledWith('f1');
    expect(openDetailPanelSpy).toHaveBeenCalled();
    expect(setFlyToTargetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 32, lng: 51, zoom: 10 }),
    );
  });
});
