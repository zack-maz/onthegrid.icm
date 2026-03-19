import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useFlightStore } from '@/stores/flightStore';
import { useEventStore } from '@/stores/eventStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
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

  it('renders all 6 counter row labels', () => {
    render(<CountersSlot />);
    expect(screen.getByText('Iranian')).toBeInTheDocument();
    expect(screen.getByText('Unidentified')).toBeInTheDocument();
    expect(screen.getByText('Airstrikes')).toBeInTheDocument();
    expect(screen.getByText('Ground Combat')).toBeInTheDocument();
    expect(screen.getByText('Targeted')).toBeInTheDocument();
    expect(screen.getByText('Fatalities')).toBeInTheDocument();
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
});
