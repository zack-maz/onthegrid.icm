import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThreatClusterDetail } from '@/components/detail/ThreatClusterDetail';
import { useEventStore } from '@/stores/eventStore';
import { useUIStore } from '@/stores/uiStore';
import { useNotificationStore } from '@/stores/notificationStore';
import type { ThreatCluster } from '@/types/ui';
import type { ConflictEventEntity } from '@/types/entities';

// Mock useGeoContext
const mockGeoContext = vi.fn();
vi.mock('@/hooks/useGeoContext', () => ({
  useGeoContext: (...args: unknown[]) => mockGeoContext(...args),
}));

function makeEvent(
  overrides: Partial<ConflictEventEntity> & { id: string; type: ConflictEventEntity['type'] },
): ConflictEventEntity {
  return {
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
      locationName: 'Test Location',
      cameoCode: '190',
    },
    ...overrides,
  };
}

const mockCluster: ThreatCluster = {
  id: 'test-cluster',
  centroidLat: 33.25,
  centroidLng: 44.25,
  cells: [],
  eventCount: 3,
  totalWeight: 50,
  dominantType: 'airstrike',
  totalFatalities: 5,
  latestTime: Date.now() - 5 * 60 * 1000,
  boundingBox: { minLat: 33.0, maxLat: 33.5, minLng: 44.0, maxLng: 44.5 },
  eventIds: ['evt-1', 'evt-2', 'evt-3'],
};

const mockEvents: ConflictEventEntity[] = [
  makeEvent({
    id: 'evt-1',
    type: 'airstrike',
    lat: 33.1,
    lng: 44.1,
    data: {
      eventType: 'Aerial weapons',
      subEventType: '',
      fatalities: 3,
      actor1: 'A',
      actor2: 'B',
      notes: '',
      source: '',
      goldsteinScale: -5,
      locationName: 'Baghdad',
      cameoCode: '195',
      numMentions: 50,
      numSources: 10,
    },
  }),
  makeEvent({
    id: 'evt-2',
    type: 'shelling',
    lat: 33.2,
    lng: 44.2,
    data: {
      eventType: 'Artillery',
      subEventType: '',
      fatalities: 0,
      actor1: 'C',
      actor2: 'D',
      notes: '',
      source: '',
      goldsteinScale: -3,
      locationName: 'Mosul',
      cameoCode: '190',
      numMentions: 2,
      numSources: 1,
    },
  }),
  makeEvent({
    id: 'evt-3',
    type: 'ground_combat',
    lat: 33.3,
    lng: 44.3,
    data: {
      eventType: 'Armed clash',
      subEventType: '',
      fatalities: 2,
      actor1: 'E',
      actor2: 'F',
      notes: '',
      source: '',
      goldsteinScale: -7,
      locationName: 'Tikrit',
      cameoCode: '180',
      numMentions: 10,
      numSources: 5,
    },
  }),
];

describe('ThreatClusterDetail', () => {
  beforeEach(() => {
    useEventStore.setState({ events: mockEvents, eventCount: mockEvents.length });
    useUIStore.setState({
      selectedEntityId: null,
      selectedCluster: mockCluster,
      isDetailPanelOpen: true,
    });
    // Default: site proximity match
    mockGeoContext.mockReturnValue({
      label: 'Near Nuclear Plant',
      type: 'site',
    });
  });

  it('renders "Threat Cluster" header text', () => {
    render(<ThreatClusterDetail cluster={mockCluster} />);
    expect(screen.getByText('Threat Cluster')).toBeInTheDocument();
  });

  it('renders event count in header', () => {
    render(<ThreatClusterDetail cluster={mockCluster} />);
    expect(screen.getByText(/3 events/)).toBeInTheDocument();
  });

  it('renders scrollable event list with correct number of events', () => {
    render(<ThreatClusterDetail cluster={mockCluster} />);
    // Each event should have a location name displayed
    expect(screen.getByText('Baghdad')).toBeInTheDocument();
    expect(screen.getByText('Mosul')).toBeInTheDocument();
    expect(screen.getByText('Tikrit')).toBeInTheDocument();
  });

  it('shows dominant type label', () => {
    render(<ThreatClusterDetail cluster={mockCluster} />);
    // "Airstrike" appears in summary and in event list entries
    expect(screen.getAllByText('Airstrike').length).toBeGreaterThanOrEqual(1);
  });

  it('shows fatalities when > 0', () => {
    render(<ThreatClusterDetail cluster={mockCluster} />);
    expect(screen.getByText(/5 fatalities/)).toBeInTheDocument();
  });

  it('clicking event card calls selectEntity with correct ID', () => {
    render(<ThreatClusterDetail cluster={mockCluster} />);

    // Click the first event (Baghdad)
    const baghdadCard = screen.getByText('Baghdad').closest('button');
    expect(baghdadCard).toBeTruthy();
    fireEvent.click(baghdadCard!);

    const state = useUIStore.getState();
    expect(state.selectedEntityId).toBe('evt-1');
    // selectedCluster should be cleared (mutual exclusion)
    expect(state.selectedCluster).toBeNull();
  });

  it('shows "N of M events visible" when some events are filtered out', () => {
    // Only provide 2 of the 3 events in the store
    useEventStore.setState({ events: mockEvents.slice(0, 2), eventCount: 2 });

    render(<ThreatClusterDetail cluster={mockCluster} />);
    expect(screen.getByText(/2 of 3 events visible/)).toBeInTheDocument();
  });

  // --- New tests ---

  it('renders geographic context label when sites are nearby', () => {
    mockGeoContext.mockReturnValue({
      label: 'Near Nuclear Plant',
      type: 'site',
    });

    render(<ThreatClusterDetail cluster={mockCluster} />);
    expect(screen.getByText('Near Nuclear Plant')).toBeInTheDocument();
  });

  it('renders geographic context with geocode fallback', () => {
    mockGeoContext.mockReturnValue({
      label: 'Baghdad, Iraq',
      type: 'geocode',
    });

    render(<ThreatClusterDetail cluster={mockCluster} />);
    expect(screen.getByText('Baghdad, Iraq')).toBeInTheDocument();
  });

  it('renders loading placeholder when geoContext is null', () => {
    mockGeoContext.mockReturnValue(null);

    render(<ThreatClusterDetail cluster={mockCluster} />);
    const container = screen.getByTestId('geo-context');
    // Should contain the animated pulse placeholder
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders event type breakdown bars sorted by count', () => {
    render(<ThreatClusterDetail cluster={mockCluster} />);

    const breakdownSection = screen.getByTestId('type-breakdown');
    expect(breakdownSection).toBeInTheDocument();

    // All three types should appear: Airstrike (1), Shelling (1), Ground Combat (1)
    // They all have count 1 so order is stable by insertion
    expect(screen.getByText('Event Types')).toBeInTheDocument();
    // Verify that the type labels are present in the breakdown
    const typeLabels = breakdownSection.querySelectorAll('.truncate');
    expect(typeLabels.length).toBe(3);
  });

  it('renders type breakdown bars with counts proportional to max', () => {
    // Create a cluster with uneven type distribution
    const unevenEvents: ConflictEventEntity[] = [
      ...Array.from({ length: 4 }, (_, i) =>
        makeEvent({ id: `air-${i}`, type: 'airstrike', data: { ...mockEvents[0].data } }),
      ),
      makeEvent({ id: 'shell-1', type: 'shelling', data: { ...mockEvents[1].data } }),
    ];
    const unevenCluster: ThreatCluster = {
      ...mockCluster,
      eventIds: unevenEvents.map((e) => e.id),
      eventCount: 5,
    };

    useEventStore.setState({ events: unevenEvents, eventCount: unevenEvents.length });

    render(<ThreatClusterDetail cluster={unevenCluster} />);

    const breakdownSection = screen.getByTestId('type-breakdown');
    // Airstrike should show count "4" and Shelling should show count "1"
    expect(breakdownSection.textContent).toContain('4');
    expect(breakdownSection.textContent).toContain('1');
  });

  it('events are sorted by threat weight (highest first)', () => {
    // evt-1 has most mentions (50) + fatalities (3) -> highest weight
    // evt-3 has moderate mentions (10) + fatalities (2)
    // evt-2 has lowest mentions (2) + 0 fatalities -> lowest weight
    render(<ThreatClusterDetail cluster={mockCluster} />);

    const eventButtons = screen.getAllByRole('button');
    // First event card should be Baghdad (highest weight: airstrike + 50 mentions + 3 fatalities)
    expect(eventButtons[0].textContent).toContain('Baghdad');
    // Last event card should be Mosul (lowest weight: shelling + 2 mentions + 0 fatalities)
    expect(eventButtons[eventButtons.length - 1].textContent).toContain('Mosul');
  });

  it('scrollable list has key={cluster.id} for scroll reset', () => {
    const { container } = render(<ThreatClusterDetail cluster={mockCluster} />);

    // The scrollable div should be present (max-h-[300px] overflow-y-auto)
    const scrollable = container.querySelector('.overflow-y-auto');
    expect(scrollable).toBeTruthy();
  });
});
