import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockState = {
  showFlights: true,
  showGroundTraffic: false,
  pulseEnabled: true,
  showShips: true,
  showDrones: true,
  showMissiles: true,
  showNews: true,
  toggleFlights: vi.fn(),
  toggleGroundTraffic: vi.fn(),
  togglePulse: vi.fn(),
  toggleShips: vi.fn(),
  toggleDrones: vi.fn(),
  toggleMissiles: vi.fn(),
  toggleNews: vi.fn(),
};

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));

import { LayerTogglesSlot } from '@/components/layout/LayerTogglesSlot';

describe('LayerTogglesSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to defaults
    mockState.showFlights = true;
    mockState.showGroundTraffic = false;
    mockState.pulseEnabled = true;
    mockState.showShips = true;
    mockState.showDrones = true;
    mockState.showMissiles = true;
    mockState.showNews = true;
  });

  it('renders "Layers" header text', () => {
    render(<LayerTogglesSlot />);
    expect(screen.getByText('Layers')).toBeTruthy();
  });

  it('renders 7 toggle row buttons', () => {
    render(<LayerTogglesSlot />);
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(7);
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
    expect(labels).toEqual(['Flights', 'Ground', 'Unidentified', 'Ships', 'Drones', 'Missiles', 'News']);
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

  it('clicking News toggle calls toggleNews', () => {
    render(<LayerTogglesSlot />);
    fireEvent.click(screen.getByLabelText('Toggle News visibility'));
    expect(mockState.toggleNews).toHaveBeenCalledOnce();
  });

  it('inactive toggle has opacity-40 class', () => {
    // showGroundTraffic is false by default
    mockState.showNews = false;
    render(<LayerTogglesSlot />);
    const groundBtn = screen.getByLabelText('Toggle Ground visibility');
    expect(groundBtn.className).toContain('opacity-40');
    const newsBtn = screen.getByLabelText('Toggle News visibility');
    expect(newsBtn.className).toContain('opacity-40');
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
});
