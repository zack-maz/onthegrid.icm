import { render, screen } from '@testing-library/react';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useUIStore } from '@/stores/uiStore';
import { StatusPanel } from '@/components/ui/StatusPanel';
import type { FlightEntity, ConflictEventEntity } from '@/types/entities';
import type { ConflictEventType } from '@/types/ui';

function makeFlight(id: string, onGround: boolean): FlightEntity {
  return {
    id, type: 'flight', lat: 32, lng: 51, timestamp: Date.now(), label: id,
    data: { icao24: id, callsign: id, originCountry: '', velocity: 0, heading: 0, altitude: onGround ? 0 : 10000, onGround, verticalRate: 0, unidentified: false },
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
const otherConflict = [makeEvent('o1', 'blockade')];
const allEvents = [...airstrikes, ...groundCombat, ...targeted, ...otherConflict];

describe('StatusPanel', () => {
  beforeEach(() => {
    useFlightStore.setState({ connectionStatus: 'connected', flights: [], flightCount: 0 });
    useShipStore.setState({ connectionStatus: 'connected', shipCount: 0 });
    useEventStore.setState({ connectionStatus: 'connected', events: [], eventCount: 0 });
    useUIStore.setState({ showFlights: true, showGroundTraffic: false, showShips: true, showEvents: true, showAirstrikes: true, showGroundCombat: true, showTargeted: true, showOtherConflict: true });
  });

  it('renders three feed lines (flights, ships, events)', () => {
    useFlightStore.setState({ flights: airborne, flightCount: 3 });
    useShipStore.setState({ shipCount: 42 });
    useEventStore.setState({ events: airstrikes, eventCount: 2 });

    render(<StatusPanel />);

    expect(screen.getByText('flights')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
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
    useShipStore.setState({ connectionStatus: 'stale', shipCount: 5 });
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
    render(<StatusPanel />);

    const dot = screen.getByTestId('status-dot-flights');
    expect(dot.className).toContain('bg-text-muted');
    expect(dot.className).toContain('animate-pulse');
    expect(screen.getByText('\u2014')).toBeInTheDocument();
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
    useShipStore.setState({ shipCount: 42 });
    useUIStore.setState({ showShips: false });
    render(<StatusPanel />);

    expect(screen.queryByText('42')).not.toBeInTheDocument();
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

    // 5 total - 1 ground_combat = 4
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows 0 events when showEvents is false', () => {
    useEventStore.setState({ events: allEvents, eventCount: 5 });
    useUIStore.setState({ showEvents: false });
    render(<StatusPanel />);

    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  it('shows 0 for events when all conflict toggles are OFF', () => {
    useEventStore.setState({ events: allEvents, eventCount: 5 });
    useUIStore.setState({ showAirstrikes: false, showGroundCombat: false, showTargeted: false, showOtherConflict: false });
    render(<StatusPanel />);

    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });
});
