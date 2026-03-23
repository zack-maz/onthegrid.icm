import { render, screen } from '@testing-library/react';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSiteStore } from '@/stores/siteStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import { StatusPanel } from '@/components/ui/StatusPanel';
import type { FlightEntity, ShipEntity, ConflictEventEntity } from '@/types/entities';
import type { ConflictEventType } from '@/types/ui';

function makeFlight(id: string, onGround: boolean, country = ''): FlightEntity {
  return {
    id, type: 'flight', lat: 32, lng: 51, timestamp: Date.now(), label: id,
    data: { icao24: id, callsign: id, originCountry: country, velocity: 0, heading: 0, altitude: onGround ? 0 : 10000, onGround, verticalRate: 0, unidentified: false },
  };
}

function makeShip(id: string, mmsi: number): ShipEntity {
  return {
    id, type: 'ship', lat: 26, lng: 56, timestamp: Date.now(), label: id,
    data: { mmsi, shipName: id, speedOverGround: 12.5, courseOverGround: 180, trueHeading: 178 },
  };
}

function makeEvent(id: string, type: ConflictEventType): ConflictEventEntity {
  return {
    id, type, lat: 32, lng: 51, timestamp: Date.now(), label: id,
    data: { eventType: '', subEventType: '', fatalities: 0, actor1: '', actor2: '', notes: '', source: '', goldsteinScale: 0, locationName: '', cameoCode: '' },
  };
}

const airborne = [makeFlight('f1', false), makeFlight('f2', false), makeFlight('f3', false)];
const ground = [makeFlight('g1', true), makeFlight('g2', true)];
const allFlights = [...airborne, ...ground];
const airstrikes = [makeEvent('a1', 'airstrike'), makeEvent('a2', 'airstrike')];
const groundCombat = [makeEvent('gc1', 'ground_combat')];
const targeted = [makeEvent('t1', 'assassination')];
const otherGroundCombat = [makeEvent('o1', 'blockade')];
const allEvents = [...airstrikes, ...groundCombat, ...targeted, ...otherGroundCombat];

describe('StatusPanel', () => {
  beforeEach(() => {
    useFlightStore.setState({ connectionStatus: 'connected', flights: [], flightCount: 0 });
    useShipStore.setState({ connectionStatus: 'connected', ships: [], shipCount: 0 });
    useEventStore.setState({ connectionStatus: 'connected', events: [], eventCount: 0 });
    useSiteStore.setState({ connectionStatus: 'idle', sites: [], siteCount: 0 });
    useUIStore.setState({ showFlights: true, showGroundTraffic: false, showShips: true, showEvents: true, showAirstrikes: true, showGroundCombat: true, showTargeted: true, showSites: true });
    useFilterStore.setState({ flightCountries: [], eventCountries: [], flightSpeedMin: null, flightSpeedMax: null, shipSpeedMin: null, shipSpeedMax: null, altitudeMin: null, altitudeMax: null, proximityPin: null, proximityRadiusKm: 100, dateStart: 0, dateEnd: Date.now() + 86400000, isSettingPin: false });
  });

  it('renders four feed lines (flights, ships, events, sites)', () => {
    useFlightStore.setState({ flights: airborne, flightCount: 3 });
    const ships = Array.from({ length: 5 }, (_, i) => makeShip(`s${i}`, 100000 + i));
    useShipStore.setState({ ships, shipCount: 5 });
    useEventStore.setState({ events: airstrikes, eventCount: 2 });

    render(<StatusPanel />);

    expect(screen.getByText('flights')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('ships')).toBeInTheDocument();
    expect(screen.getByText('events')).toBeInTheDocument();
  });

  it('shows green dot for connected status', () => {
    useFlightStore.setState({ connectionStatus: 'connected', flights: [makeFlight('f1', false)], flightCount: 1 });
    render(<StatusPanel />);

    const dot = screen.getByTestId('status-dot-flights');
    expect(dot.className).toContain('bg-accent-green');
  });

  it('shows yellow dot for stale status', () => {
    useShipStore.setState({ connectionStatus: 'stale', ships: [makeShip('s1', 100)], shipCount: 1 });
    render(<StatusPanel />);

    const dot = screen.getByTestId('status-dot-ships');
    expect(dot.className).toContain('bg-accent-yellow');
  });

  it('shows red dot for error status', () => {
    useEventStore.setState({ connectionStatus: 'error', eventCount: 0 });
    render(<StatusPanel />);

    const dot = screen.getByTestId('status-dot-events');
    expect(dot.className).toContain('bg-accent-red');
  });

  it('shows gray pulsing dot and dash for loading status', () => {
    useFlightStore.setState({ connectionStatus: 'loading', flights: [], flightCount: 0 });
    useSiteStore.setState({ connectionStatus: 'connected', sites: [], siteCount: 0 });
    render(<StatusPanel />);

    const dot = screen.getByTestId('status-dot-flights');
    expect(dot.className).toContain('bg-text-muted');
    expect(dot.className).toContain('animate-pulse');
    expect(screen.getAllByText('\u2014').length).toBeGreaterThanOrEqual(1);
  });

  it('shows red dot for rate_limited status', () => {
    useFlightStore.setState({ connectionStatus: 'rate_limited', flights: [makeFlight('f1', false)], flightCount: 1 });
    render(<StatusPanel />);

    const dot = screen.getByTestId('status-dot-flights');
    expect(dot.className).toContain('bg-accent-red');
  });

  it('excludes ground flights from count when showGroundTraffic is OFF', () => {
    useFlightStore.setState({ flights: allFlights, flightCount: 5 });
    useUIStore.setState({ showFlights: true, showGroundTraffic: false });
    render(<StatusPanel />);

    // 3 airborne only
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('includes ground flights when showGroundTraffic is ON', () => {
    useFlightStore.setState({ flights: allFlights, flightCount: 5 });
    useUIStore.setState({ showFlights: true, showGroundTraffic: true });
    render(<StatusPanel />);

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows only ground count when showFlights OFF but showGroundTraffic ON', () => {
    useFlightStore.setState({ flights: allFlights, flightCount: 5 });
    useUIStore.setState({ showFlights: false, showGroundTraffic: true });
    render(<StatusPanel />);

    // 2 ground only
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows 0 for flights when both showFlights and showGroundTraffic are OFF', () => {
    useFlightStore.setState({ flights: allFlights, flightCount: 5 });
    useUIStore.setState({ showFlights: false, showGroundTraffic: false });
    render(<StatusPanel />);

    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  it('shows 0 for ships when showShips is OFF', () => {
    const ships = Array.from({ length: 5 }, (_, i) => makeShip(`s${i}`, 100000 + i));
    useShipStore.setState({ ships, shipCount: 5 });
    useUIStore.setState({ showShips: false });
    render(<StatusPanel />);

    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  it('counts all events when all conflict toggles are ON', () => {
    useEventStore.setState({ events: allEvents, eventCount: 5 });
    render(<StatusPanel />);

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('excludes airstrikes when showAirstrikes is OFF', () => {
    useEventStore.setState({ events: allEvents, eventCount: 5 });
    useUIStore.setState({ showAirstrikes: false });
    render(<StatusPanel />);

    // 5 total - 2 airstrikes = 3
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('excludes ground combat when showGroundCombat is OFF', () => {
    useEventStore.setState({ events: allEvents, eventCount: 5 });
    useUIStore.setState({ showGroundCombat: false });
    render(<StatusPanel />);

    // 5 total - 2 (ground_combat + blockade) = 3
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows 0 events when showEvents is false', () => {
    useEventStore.setState({ events: allEvents, eventCount: 5 });
    useUIStore.setState({ showEvents: false });
    render(<StatusPanel />);

    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  it('shows 0 for events when all conflict toggles are OFF', () => {
    useEventStore.setState({ events: allEvents, eventCount: 5 });
    useUIStore.setState({ showAirstrikes: false, showGroundCombat: false, showTargeted: false });
    render(<StatusPanel />);

    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  describe('filter-aware counts', () => {
    it('country filter reduces flight count', () => {
      const iranFlights = [makeFlight('f1', false, 'Iran'), makeFlight('f2', false, 'Iran')];
      const qatarFlight = [makeFlight('f3', false, 'Qatar')];
      useFlightStore.setState({ flights: [...iranFlights, ...qatarFlight], flightCount: 3 });
      useFilterStore.setState({ flightCountries: ['Iran'] });
      render(<StatusPanel />);

      // Only 2 Iran flights pass the country filter
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('ships unaffected by altitude filter', () => {
      const ships = [makeShip('s1', 100), makeShip('s2', 101)];
      useShipStore.setState({ ships, shipCount: 2 });
      useFilterStore.setState({ altitudeMin: 5000 });
      render(<StatusPanel />);

      // Ships don't have altitude, should pass through altitude filter
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('altitude filter reduces flight count', () => {
      // makeFlight with onGround=false has altitude 10000m = ~32808ft
      const flights = [makeFlight('f1', false), makeFlight('f2', false)];
      useFlightStore.setState({ flights, flightCount: 2 });
      // Only show flights above 40000ft -- should exclude all at ~32808ft
      useFilterStore.setState({ altitudeMin: 40000 });
      render(<StatusPanel />);

      // All flights filtered out (altitude ~32808ft < 40000ft min)
      expect(screen.queryByText('2')).not.toBeInTheDocument();
    });
  });
});
