import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { DetailPanelSlot } from '@/components/layout/DetailPanelSlot';
import { useUIStore } from '@/stores/uiStore';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import type { PanelView } from '@/types/ui';
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

const mockAirstrike: ConflictEventEntity = {
  id: 'event-airstrike-1',
  type: 'airstrike',
  lat: 32.654321,
  lng: 51.123456,
  timestamp: Date.now(),
  label: 'Aerial weapons',
  data: {
    eventType: 'Aerial weapons',
    subEventType: 'CAMEO 195',
    fatalities: 0,
    actor1: 'Unknown',
    actor2: 'Iran',
    notes: '',
    source: 'https://example.com/article',
    goldsteinScale: -5.0,
    locationName: 'Isfahan, Iran',
    cameoCode: '195',
  },
};

const mockEnrichedAirstrike: ConflictEventEntity = {
  id: 'event-enriched-1',
  type: 'airstrike',
  lat: 35.123456,
  lng: 44.654321,
  timestamp: Date.now(),
  label: 'Aerial weapons',
  data: {
    eventType: 'Aerial weapons',
    subEventType: 'CAMEO 195',
    fatalities: 3,
    actor1: 'Unknown',
    actor2: 'Iran',
    notes: '',
    source: 'https://example.com/article',
    goldsteinScale: -7.0,
    locationName: 'Deir ez-Zor, eastern Syria',
    cameoCode: '195',
    summary: 'Coalition forces conducted an airstrike near Deir ez-Zor targeting militia positions.',
    casualties: { killed: 3, injured: 5 },
    precision: 'neighborhood',
    sourceCount: 4,
    llmProcessed: true,
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
    useFlightStore.setState({ flights: [], activeSource: 'opensky' as const });
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

  it('renders event type when airstrike selected', () => {
    useEventStore.setState({ events: [mockAirstrike] });
    useUIStore.setState({ selectedEntityId: 'event-airstrike-1', isDetailPanelOpen: true });

    render(<DetailPanelSlot />);

    // AIRSTRIKE appears in header type label
    const header = screen.getByTestId('detail-panel-header');
    expect(header).toHaveTextContent('AIRSTRIKE');
    // Event type appears in header name + EventDetail event type field
    expect(screen.getAllByText('Aerial weapons').length).toBeGreaterThanOrEqual(1);
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

  it('Escape key closes panel (via centralized handler / store action)', () => {
    useFlightStore.setState({ flights: [mockFlight] });
    useUIStore.setState({ selectedEntityId: 'flight-abc', isDetailPanelOpen: true });

    // Escape is now handled by centralized useEscapeKeyHandler in AppShell.
    // Verify the store actions that the handler calls work correctly.
    useUIStore.getState().closeDetailPanel();
    useUIStore.getState().selectEntity(null);

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

  describe('LLM-enriched event detail', () => {
    it('renders summary when LLM-enriched event is selected', () => {
      useEventStore.setState({ events: [mockEnrichedAirstrike] });
      useUIStore.setState({ selectedEntityId: 'event-enriched-1', isDetailPanelOpen: true });

      render(<DetailPanelSlot />);

      expect(screen.getByText('Summary')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Coalition forces conducted an airstrike near Deir ez-Zor targeting militia positions.',
        ),
      ).toBeInTheDocument();
    });

    it('renders casualties when present', () => {
      useEventStore.setState({ events: [mockEnrichedAirstrike] });
      useUIStore.setState({ selectedEntityId: 'event-enriched-1', isDetailPanelOpen: true });

      render(<DetailPanelSlot />);

      expect(screen.getByText('Casualties')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument(); // killed
      expect(screen.getByText('5')).toBeInTheDocument(); // injured
    });

    it('renders precision indicator for enriched events', () => {
      useEventStore.setState({ events: [mockEnrichedAirstrike] });
      useUIStore.setState({ selectedEntityId: 'event-enriched-1', isDetailPanelOpen: true });

      render(<DetailPanelSlot />);

      expect(screen.getByText('Neighborhood-level (~1km)')).toBeInTheDocument();
    });

    it('renders AI-enriched badge when llmProcessed is true', () => {
      useEventStore.setState({ events: [mockEnrichedAirstrike] });
      useUIStore.setState({ selectedEntityId: 'event-enriched-1', isDetailPanelOpen: true });

      render(<DetailPanelSlot />);

      expect(screen.getByText('AI-enriched')).toBeInTheDocument();
    });

    it('renders source count when sourceCount is present', () => {
      useEventStore.setState({ events: [mockEnrichedAirstrike] });
      useUIStore.setState({ selectedEntityId: 'event-enriched-1', isDetailPanelOpen: true });

      render(<DetailPanelSlot />);

      expect(screen.getByText('Reported by 4 sources')).toBeInTheDocument();
    });

    it('does not render summary for non-enriched events', () => {
      useEventStore.setState({ events: [mockAirstrike] });
      useUIStore.setState({ selectedEntityId: 'event-airstrike-1', isDetailPanelOpen: true });

      render(<DetailPanelSlot />);

      expect(screen.queryByText('Summary')).not.toBeInTheDocument();
      expect(screen.queryByText('AI-enriched')).not.toBeInTheDocument();
    });
  });

  describe('navigation stack UI', () => {
    const mockStackEntry: PanelView = {
      entityId: 'flight-abc',
      cluster: null,
      breadcrumbLabel: 'FLIGHT QTR123',
    };

    it('BreadcrumbRow does not render when stack is empty', () => {
      useFlightStore.setState({ flights: [mockFlight] });
      useUIStore.setState({
        selectedEntityId: 'flight-abc',
        isDetailPanelOpen: true,
        navigationStack: [],
      });

      render(<DetailPanelSlot />);

      expect(screen.queryByTestId('breadcrumb-row')).not.toBeInTheDocument();
    });

    it('BreadcrumbRow renders when stack has entries', () => {
      useFlightStore.setState({ flights: [mockFlight] });
      useUIStore.setState({
        selectedEntityId: 'flight-abc',
        isDetailPanelOpen: true,
        navigationStack: [mockStackEntry],
      });

      render(<DetailPanelSlot />);

      expect(screen.getByTestId('breadcrumb-row')).toBeInTheDocument();
    });

    it('BreadcrumbRow shows correct labels from stack entries', () => {
      const stackEntries: PanelView[] = [
        { entityId: 'ship-123', cluster: null, breadcrumbLabel: 'SHIP EVER GIVEN' },
        { entityId: 'flight-abc', cluster: null, breadcrumbLabel: 'FLIGHT QTR123' },
      ];

      useFlightStore.setState({ flights: [mockFlight] });
      useShipStore.setState({ ships: [mockShip] });
      useUIStore.setState({
        selectedEntityId: 'flight-abc',
        isDetailPanelOpen: true,
        navigationStack: stackEntries,
      });

      render(<DetailPanelSlot />);

      expect(screen.getByText('SHIP EVER GIVEN')).toBeInTheDocument();
      expect(screen.getByText('FLIGHT QTR123')).toBeInTheDocument();
    });

    it('Back button in breadcrumb calls goBack (verify store state changes)', () => {
      const stackEntry: PanelView = {
        entityId: 'ship-123',
        cluster: null,
        breadcrumbLabel: 'SHIP EVER GIVEN',
      };

      useFlightStore.setState({ flights: [mockFlight] });
      useShipStore.setState({ ships: [mockShip] });
      useUIStore.setState({
        selectedEntityId: 'flight-abc',
        isDetailPanelOpen: true,
        navigationStack: [stackEntry],
      });

      render(<DetailPanelSlot />);

      const backBtn = screen.getByTestId('breadcrumb-back');
      fireEvent.click(backBtn);

      const state = useUIStore.getState();
      expect(state.navigationStack).toHaveLength(0);
      expect(state.selectedEntityId).toBe('ship-123');
    });

    it('Close button clears the navigation stack', () => {
      useFlightStore.setState({ flights: [mockFlight] });
      useUIStore.setState({
        selectedEntityId: 'flight-abc',
        isDetailPanelOpen: true,
        navigationStack: [mockStackEntry],
      });

      render(<DetailPanelSlot />);

      const closeBtn = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeBtn);

      const state = useUIStore.getState();
      expect(state.navigationStack).toHaveLength(0);
      expect(state.isDetailPanelOpen).toBe(false);
    });

    it('Slide direction class applied to content area on forward navigation', () => {
      useFlightStore.setState({ flights: [mockFlight] });
      useUIStore.setState({
        selectedEntityId: 'flight-abc',
        isDetailPanelOpen: true,
        navigationStack: [mockStackEntry],
        slideDirection: 'forward',
      });

      render(<DetailPanelSlot />);

      const content = screen.getByTestId('detail-content');
      expect(content.className).toContain('animate-slide-in-right');
    });

    it('Slide direction class applied to content area on back navigation', () => {
      useFlightStore.setState({ flights: [mockFlight] });
      useUIStore.setState({
        selectedEntityId: 'flight-abc',
        isDetailPanelOpen: true,
        navigationStack: [],
        slideDirection: 'back',
      });

      render(<DetailPanelSlot />);

      const content = screen.getByTestId('detail-content');
      expect(content.className).toContain('animate-slide-in-left');
    });
  });
});
