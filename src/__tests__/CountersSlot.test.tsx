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
      altitudeMin: null,
      altitudeMax: null,
      proximityPin: null,
      proximityRadiusKm: 100,
      dateStart: 0,
      dateEnd: Date.now() + 86400000,
      isSettingPin: false,
    });
  });

  it('renders FLIGHTS section header', () => {
    render(<CountersSlot />);
    expect(screen.getAllByText('Flights').length).toBeGreaterThan(0);
  });

  it('renders EVENTS section header', () => {
    render(<CountersSlot />);
    expect(screen.getByText('Events')).toBeInTheDocument();
  });

  it('renders all counter row labels', () => {
    render(<CountersSlot />);
    expect(screen.getAllByText('Flights').length).toBeGreaterThan(0);
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
        makeFlight('f3', 'Qatar'),
      ],
      flightCount: 3,
    });
    render(<CountersSlot />);

    // Flights = 3
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides content when collapsed', () => {
    useUIStore.setState({ isCountersCollapsed: true });
    render(<CountersSlot />);

    expect(screen.queryByText('Flights')).not.toBeInTheDocument();
    expect(screen.queryByText('Events')).not.toBeInTheDocument();
  });

  // --- Expandable dropdown behavior ---

  it('clicking a counter row with entities > 0 expands it', () => {
    useEventStore.setState({
      events: [makeEvent('e1', 'airstrike')],
      eventCount: 1,
    });
    render(<CountersSlot />);

    const buttons = screen.getAllByTestId('counter-row-button');
    const airstrikesBtn = buttons.find(
      (btn) => btn.textContent?.includes('Airstrikes'),
    );
    expect(airstrikesBtn).toBeDefined();
    fireEvent.click(airstrikesBtn!);

    const items = screen.getAllByTestId('entity-list-item');
    expect(items.length).toBe(1);
  });

  it('accordion: expanding a second row collapses the first', () => {
    useFlightStore.setState({
      flights: [makeFlight('f1', 'Iran')],
      flightCount: 1,
    });
    useEventStore.setState({
      events: [makeEvent('e1', 'airstrike')],
      eventCount: 1,
    });
    render(<CountersSlot />);

    const buttons = screen.getAllByTestId('counter-row-button');
    const flightsBtn = buttons.find(
      (btn) => btn.textContent?.includes('Flights'),
    );
    const airstrikesBtn = buttons.find(
      (btn) => btn.textContent?.includes('Airstrikes'),
    );

    // Expand flights
    fireEvent.click(flightsBtn!);
    let items = screen.getAllByTestId('entity-list-item');
    expect(items.length).toBe(1);

    // Expand airstrikes -- flights should collapse
    fireEvent.click(airstrikesBtn!);
    items = screen.getAllByTestId('entity-list-item');
    expect(items.length).toBe(1);
  });

  it('counter row with value 0 has disabled styling and no chevron', () => {
    render(<CountersSlot />);

    const buttons = screen.getAllByTestId('counter-row-button');
    const airstrikesBtn = buttons.find(
      (btn) => btn.textContent?.includes('Airstrikes'),
    );
    expect(airstrikesBtn).toBeDefined();
    expect(airstrikesBtn!.className).toContain('opacity-40');
    expect(airstrikesBtn!.className).toContain('pointer-events-none');

    const svg = airstrikesBtn!.querySelector('svg');
    expect(svg).toBeNull();
  });

  it('expanded dropdown with entities shows entity labels', () => {
    useEventStore.setState({
      events: [
        makeEvent('e1', 'airstrike'),
        makeEvent('e2', 'airstrike'),
      ],
      eventCount: 2,
    });
    render(<CountersSlot />);

    const buttons = screen.getAllByTestId('counter-row-button');
    const airstrikesBtn = buttons.find(
      (btn) => btn.textContent?.includes('Airstrikes'),
    );
    fireEvent.click(airstrikesBtn!);

    // Entity labels use EVENT_TYPE_LABELS, so both show "Airstrike"
    const items = screen.getAllByTestId('entity-list-item');
    expect(items.length).toBe(2);
  });

  it('clicking an entity calls selectEntity and openDetailPanel', () => {
    useEventStore.setState({
      events: [makeEvent('e1', 'airstrike')],
      eventCount: 1,
    });
    const selectEntitySpy = vi.fn();
    const openDetailPanelSpy = vi.fn();
    const setFlyToTargetSpy = vi.fn();

    useUIStore.setState({
      selectEntity: selectEntitySpy,
      openDetailPanel: openDetailPanelSpy,
    });
    useNotificationStore.setState({
      setFlyToTarget: setFlyToTargetSpy,
    });

    render(<CountersSlot />);

    const buttons = screen.getAllByTestId('counter-row-button');
    const airstrikesBtn = buttons.find(
      (btn) => btn.textContent?.includes('Airstrikes'),
    );
    fireEvent.click(airstrikesBtn!);

    const entityItem = screen.getByTestId('entity-list-item');
    fireEvent.click(entityItem);

    expect(selectEntitySpy).toHaveBeenCalledWith('e1');
    expect(openDetailPanelSpy).toHaveBeenCalled();
    expect(setFlyToTargetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 32, lng: 51, zoom: 10 }),
    );
  });
});
