import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { DetailPanelSlot } from '@/components/layout/DetailPanelSlot';
import { useUIStore } from '@/stores/uiStore';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import type { FlightEntity, ShipEntity, ConflictEventEntity } from '@/types/entities';

const mockFlight: FlightEntity = {
  id: 'flight-abc',
  type: 'flight',
  lat: 32.123456,
  lng: 51.654321,
  timestamp: Date.now(),
  label: 'QTR123',
  data: {
    icao24: 'abc123',
    callsign: 'QTR123',
    originCountry: 'Qatar',
    velocity: 250,
    heading: 90,
    altitude: 10000,
    onGround: false,
    verticalRate: 2.5,
    unidentified: false,
  },
};

const mockShip: ShipEntity = {
  id: 'ship-123',
  type: 'ship',
  lat: 26.123456,
  lng: 56.654321,
  timestamp: Date.now(),
  label: 'EVER GIVEN',
  data: {
    mmsi: 353136000,
    shipName: 'EVER GIVEN',
    speedOverGround: 12.5,
    courseOverGround: 180,
    trueHeading: 179,
  },
};

const mockDrone: ConflictEventEntity = {
  id: 'event-drone-1',
  type: 'drone',
  lat: 32.654321,
  lng: 51.123456,
  timestamp: Date.now(),
  label: 'Air/drone strike',
  data: {
    eventType: 'Explosions/Remote violence',
    subEventType: 'Air/drone strike',
    fatalities: 0,
    actor1: 'Unknown',
    actor2: 'Iran',
    notes: '',
    source: 'https://example.com/article',
    goldsteinScale: -5.0,
    locationName: 'Isfahan, Iran',
    cameoCode: '183',
  },
};

describe('DetailPanelSlot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
    useUIStore.setState({
      selectedEntityId: null,
      isDetailPanelOpen: false,
    });
    useFlightStore.setState({ flights: [], activeSource: 'adsblol' as const });
    useShipStore.setState({ ships: [] });
    useEventStore.setState({ events: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders flight callsign and ICAO when flight selected', () => {
    useFlightStore.setState({ flights: [mockFlight] });
    useUIStore.setState({ selectedEntityId: 'flight-abc', isDetailPanelOpen: true });

    render(<DetailPanelSlot />);

    // QTR123 appears in header + FlightDetail callsign field
    expect(screen.getAllByText('QTR123').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('abc123')).toBeInTheDocument();
  });

  it('renders ship name when ship selected', () => {
    useShipStore.setState({ ships: [mockShip] });
    useUIStore.setState({ selectedEntityId: 'ship-123', isDetailPanelOpen: true });

    render(<DetailPanelSlot />);

    // EVER GIVEN appears in header + ShipDetail name field
    expect(screen.getAllByText('EVER GIVEN').length).toBeGreaterThanOrEqual(1);
  });

  it('renders event type when drone selected', () => {
    useEventStore.setState({ events: [mockDrone] });
    useUIStore.setState({ selectedEntityId: 'event-drone-1', isDetailPanelOpen: true });

    render(<DetailPanelSlot />);

    // Drone appears in header type label + EventDetail type field
    expect(screen.getAllByText('Drone').length).toBeGreaterThanOrEqual(1);
    // Event type appears in header name + EventDetail event type field
    expect(screen.getAllByText('Explosions/Remote violence').length).toBeGreaterThanOrEqual(1);
  });

  it('header shows type label and entity name', () => {
    useFlightStore.setState({ flights: [mockFlight] });
    useUIStore.setState({ selectedEntityId: 'flight-abc', isDetailPanelOpen: true });

    render(<DetailPanelSlot />);

    // Type label in header
    const header = screen.getByTestId('detail-panel-header');
    expect(header).toHaveTextContent('FLIGHT');
    expect(header).toHaveTextContent('QTR123');
  });

  it('close button calls closeDetailPanel and selectEntity(null)', () => {
    useFlightStore.setState({ flights: [mockFlight] });
    useUIStore.setState({ selectedEntityId: 'flight-abc', isDetailPanelOpen: true });

    render(<DetailPanelSlot />);

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);

    const state = useUIStore.getState();
    expect(state.isDetailPanelOpen).toBe(false);
    expect(state.selectedEntityId).toBeNull();
  });

  it('Escape key closes panel when open', () => {
    useFlightStore.setState({ flights: [mockFlight] });
    useUIStore.setState({ selectedEntityId: 'flight-abc', isDetailPanelOpen: true });

    render(<DetailPanelSlot />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    const state = useUIStore.getState();
    expect(state.isDetailPanelOpen).toBe(false);
    expect(state.selectedEntityId).toBeNull();
  });

  it('Escape key has no effect when panel is closed', () => {
    useUIStore.setState({ isDetailPanelOpen: false, selectedEntityId: null });

    render(<DetailPanelSlot />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    const state = useUIStore.getState();
    expect(state.isDetailPanelOpen).toBe(false);
    expect(state.selectedEntityId).toBeNull();
  });

  it('copy button calls navigator.clipboard.writeText with formatted coordinates', async () => {
    useFlightStore.setState({ flights: [mockFlight] });
    useUIStore.setState({ selectedEntityId: 'flight-abc', isDetailPanelOpen: true });

    render(<DetailPanelSlot />);

    const copyBtn = screen.getByTestId('copy-coords-btn');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('32.123456, 51.654321');
  });

  it('shows "Copied!" feedback after copy', async () => {
    useFlightStore.setState({ flights: [mockFlight] });
    useUIStore.setState({ selectedEntityId: 'flight-abc', isDetailPanelOpen: true });

    render(<DetailPanelSlot />);

    const copyBtn = screen.getByTestId('copy-coords-btn');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(screen.getByText('Copied!')).toBeInTheDocument();

    // Reverts after 2s
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
  });

  it('shows LOST CONTACT when entity disappears from store', () => {
    useFlightStore.setState({ flights: [mockFlight] });
    useUIStore.setState({ selectedEntityId: 'flight-abc', isDetailPanelOpen: true });

    const { rerender } = render(<DetailPanelSlot />);
    expect(screen.getAllByText('QTR123').length).toBeGreaterThanOrEqual(1);

    // Entity disappears
    act(() => {
      useFlightStore.setState({ flights: [] });
    });
    rerender(<DetailPanelSlot />);

    expect(screen.getByText('LOST CONTACT')).toBeInTheDocument();
  });

  it('shows relative time "Updated Xs ago"', () => {
    useFlightStore.setState({ flights: [mockFlight] });
    useUIStore.setState({ selectedEntityId: 'flight-abc', isDetailPanelOpen: true });

    render(<DetailPanelSlot />);

    // Advance timer and check for relative time text
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText(/Updated \d+s ago/)).toBeInTheDocument();
  });
});
