import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockState = {
  showFlights: true,
  showGroundTraffic: false,
  pulseEnabled: true,
  showShips: true,
  showEvents: true,
  showAirstrikes: true,
  showGroundCombat: true,
  showTargeted: true,
  isLayersCollapsed: false,
  toggleFlights: vi.fn(),
  toggleGroundTraffic: vi.fn(),
  togglePulse: vi.fn(),
  toggleShips: vi.fn(),
  toggleEvents: vi.fn(),
  toggleAirstrikes: vi.fn(),
  toggleGroundCombat: vi.fn(),
  toggleTargeted: vi.fn(),
  toggleLayers: vi.fn(),
};

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));

const mockFilterState = {
  savedToggles: null as { showFlights: boolean; showGroundTraffic: boolean; pulseEnabled: boolean; showShips: boolean } | null,
};

vi.mock('@/stores/filterStore', () => ({
  useFilterStore: (selector: (s: typeof mockFilterState) => unknown) => selector(mockFilterState),
}));

import { LayerTogglesSlot } from '@/components/layout/LayerTogglesSlot';

describe('LayerTogglesSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFilterState.savedToggles = null;
    // Reset to defaults
    mockState.showFlights = true;
    mockState.showGroundTraffic = false;
    mockState.pulseEnabled = true;
    mockState.showShips = true;
    mockState.showEvents = true;
    mockState.showAirstrikes = true;
    mockState.showGroundCombat = true;
    mockState.showTargeted = true;
    mockState.isLayersCollapsed = false;
  });

  it('renders "Layers" header text', () => {
    render(<LayerTogglesSlot />);
    expect(screen.getByText('Layers')).toBeTruthy();
  });

  it('renders 8 toggle row buttons', () => {
    render(<LayerTogglesSlot />);
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(8);
  });

  it('each button has role="switch" and aria-checked', () => {
    render(<LayerTogglesSlot />);
    const switches = screen.getAllByRole('switch');
    switches.forEach((btn) => {
      expect(btn.getAttribute('role')).toBe('switch');
      expect(btn.getAttribute('aria-checked')).toBeDefined();
    });
  });

  it('renders toggle rows in correct order', () => {
    render(<LayerTogglesSlot />);
    const switches = screen.getAllByRole('switch');
    const labels = switches.map((btn) => btn.textContent?.trim());
    expect(labels).toEqual(['Flights', 'Ground', 'Unidentified', 'Ships', 'Events', 'Airstrikes', 'Ground Combat', 'Targeted']);
  });

  it('clicking Flights toggle calls toggleFlights', () => {
    render(<LayerTogglesSlot />);
    fireEvent.click(screen.getByLabelText('Toggle Flights visibility'));
    expect(mockState.toggleFlights).toHaveBeenCalledOnce();
  });

  it('clicking Ships toggle calls toggleShips', () => {
    render(<LayerTogglesSlot />);
    fireEvent.click(screen.getByLabelText('Toggle Ships visibility'));
    expect(mockState.toggleShips).toHaveBeenCalledOnce();
  });

  it('clicking Events toggle calls toggleEvents', () => {
    render(<LayerTogglesSlot />);
    fireEvent.click(screen.getByLabelText('Toggle Events visibility'));
    expect(mockState.toggleEvents).toHaveBeenCalledOnce();
  });

  it('clicking Airstrikes toggle calls toggleAirstrikes', () => {
    render(<LayerTogglesSlot />);
    fireEvent.click(screen.getByLabelText('Toggle Airstrikes visibility'));
    expect(mockState.toggleAirstrikes).toHaveBeenCalledOnce();
  });

  it('clicking Ground Combat toggle calls toggleGroundCombat', () => {
    render(<LayerTogglesSlot />);
    fireEvent.click(screen.getByLabelText('Toggle Ground Combat visibility'));
    expect(mockState.toggleGroundCombat).toHaveBeenCalledOnce();
  });

  it('clicking Targeted toggle calls toggleTargeted', () => {
    render(<LayerTogglesSlot />);
    fireEvent.click(screen.getByLabelText('Toggle Targeted visibility'));
    expect(mockState.toggleTargeted).toHaveBeenCalledOnce();
  });

  it('inactive toggle has opacity-40 class', () => {
    // showGroundTraffic is false by default
    mockState.showAirstrikes = false;
    render(<LayerTogglesSlot />);
    const groundBtn = screen.getByLabelText('Toggle Ground visibility');
    expect(groundBtn.className).toContain('opacity-40');
    const airstrikeBtn = screen.getByLabelText('Toggle Airstrikes visibility');
    expect(airstrikeBtn.className).toContain('opacity-40');
  });

  it('active toggle has opacity-100 class', () => {
    render(<LayerTogglesSlot />);
    const flightsBtn = screen.getByLabelText('Toggle Flights visibility');
    expect(flightsBtn.className).toContain('opacity-100');
  });

  it('Ground and Pulse rows have indent styling (pl-4)', () => {
    render(<LayerTogglesSlot />);
    const groundBtn = screen.getByLabelText('Toggle Ground visibility');
    const pulseBtn = screen.getByLabelText('Toggle Unidentified visibility');
    expect(groundBtn.className).toContain('pl-4');
    expect(pulseBtn.className).toContain('pl-4');
  });

  it('non-indented rows do not have pl-4', () => {
    render(<LayerTogglesSlot />);
    const flightsBtn = screen.getByLabelText('Toggle Flights visibility');
    const shipsBtn = screen.getByLabelText('Toggle Ships visibility');
    expect(flightsBtn.className).not.toContain('pl-4');
    expect(shipsBtn.className).not.toContain('pl-4');
  });

  it('indented rows have text-[10px] class', () => {
    render(<LayerTogglesSlot />);
    const groundBtn = screen.getByLabelText('Toggle Ground visibility');
    const pulseBtn = screen.getByLabelText('Toggle Unidentified visibility');
    expect(groundBtn.className).toContain('text-[10px]');
    expect(pulseBtn.className).toContain('text-[10px]');
  });

  describe('custom range disabling', () => {
    it('flight/ship toggles are disabled when custom range is active', () => {
      mockFilterState.savedToggles = { showFlights: true, showGroundTraffic: false, pulseEnabled: true, showShips: true };
      render(<LayerTogglesSlot />);
      expect(screen.getByLabelText('Toggle Flights visibility')).toBeDisabled();
      expect(screen.getByLabelText('Toggle Ground visibility')).toBeDisabled();
      expect(screen.getByLabelText('Toggle Unidentified visibility')).toBeDisabled();
      expect(screen.getByLabelText('Toggle Ships visibility')).toBeDisabled();
    });

    it('flight/ship toggles are enabled when custom range is not active', () => {
      mockFilterState.savedToggles = null;
      render(<LayerTogglesSlot />);
      expect(screen.getByLabelText('Toggle Flights visibility')).not.toBeDisabled();
      expect(screen.getByLabelText('Toggle Ships visibility')).not.toBeDisabled();
    });

    it('event toggles are NOT disabled by custom range', () => {
      mockFilterState.savedToggles = { showFlights: true, showGroundTraffic: false, pulseEnabled: true, showShips: true };
      render(<LayerTogglesSlot />);
      expect(screen.getByLabelText('Toggle Events visibility')).not.toBeDisabled();
      expect(screen.getByLabelText('Toggle Airstrikes visibility')).not.toBeDisabled();
    });
  });
});
