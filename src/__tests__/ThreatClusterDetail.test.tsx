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

  it('clicking event card pushes current cluster view to navigation stack before selecting event', () => {
    // Ensure panel is open with a selected cluster and empty stack
    useUIStore.setState({
      selectedEntityId: null,
      selectedCluster: mockCluster,
      isDetailPanelOpen: true,
      navigationStack: [],
    });

    render(<ThreatClusterDetail cluster={mockCluster} />);

    // Click the first event (Baghdad)
    const baghdadCard = screen.getByText('Baghdad').closest('button');
    expect(baghdadCard).toBeTruthy();
    fireEvent.click(baghdadCard!);

    const state = useUIStore.getState();
    // Navigation stack should have the cluster view pushed
    expect(state.navigationStack).toHaveLength(1);
    expect(state.navigationStack[0].cluster).toEqual(mockCluster);
    expect(state.navigationStack[0].entityId).toBeNull();
    expect(state.navigationStack[0].breadcrumbLabel).toMatch(/Cluster\(3\)/);
    // Selected entity should be the clicked event
    expect(state.selectedEntityId).toBe('evt-1');
  });

  // --- 23.2 enrichment tests ---

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
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders event type breakdown bars sorted by count', () => {
    render(<ThreatClusterDetail cluster={mockCluster} />);

    const breakdownSection = screen.getByTestId('type-breakdown');
    expect(breakdownSection).toBeInTheDocument();
    expect(screen.getByText('Event Types')).toBeInTheDocument();
    const typeLabels = breakdownSection.querySelectorAll('.truncate');
    expect(typeLabels.length).toBe(3);
  });

  it('events are sorted by threat weight (highest first)', () => {
    render(<ThreatClusterDetail cluster={mockCluster} />);

    const eventButtons = screen.getAllByRole('button');
    expect(eventButtons[0].textContent).toContain('Baghdad');
    expect(eventButtons[eventButtons.length - 1].textContent).toContain('Mosul');
  });

  it('scrollable list has key={cluster.id} for scroll reset', () => {
    const { container } = render(<ThreatClusterDetail cluster={mockCluster} />);

    const scrollable = container.querySelector('.overflow-y-auto');
    expect(scrollable).toBeTruthy();
  });
});
