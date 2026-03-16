import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFlightStore } from '@/stores/flightStore';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

describe('SourceSelector', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock);
    localStorageMock.clear();

    useFlightStore.setState({
      flights: [],
      connectionStatus: 'connected',
      lastFetchAt: Date.now(),
      lastFresh: Date.now(),
      flightCount: 247,
      activeSource: 'opensky',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Lazy import to avoid module-level issues
  async function renderSelector() {
    const { SourceSelector } = await import('@/components/ui/SourceSelector');
    return render(<SourceSelector />);
  }

  it('renders current source label with chevron indicator', async () => {
    await renderSelector();

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('OpenSky')).toBeInTheDocument();
  });

  it('renders ADS-B Exchange label when adsb is active', async () => {
    useFlightStore.setState({ activeSource: 'adsb' });
    await renderSelector();

    expect(screen.getByText('ADS-B Exchange')).toBeInTheDocument();
  });

  it('clicking the button toggles dropdown open/closed', async () => {
    await renderSelector();

    const button = screen.getByRole('combobox');

    // Dropdown should be closed initially
    expect(screen.queryByRole('option')).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(button);
    expect(screen.getAllByRole('option')).toHaveLength(2);

    // Click again to close
    fireEvent.click(button);
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('selecting a different source calls setActiveSource and closes dropdown', async () => {
    const setActiveSource = vi.fn();
    useFlightStore.setState({ setActiveSource });

    await renderSelector();

    // Open dropdown
    fireEvent.click(screen.getByRole('combobox'));

    // Click ADS-B Exchange option
    const options = screen.getAllByRole('option');
    const adsbOption = options.find(o => o.textContent?.includes('ADS-B Exchange'));
    expect(adsbOption).toBeDefined();
    fireEvent.click(adsbOption!);

    // Should have called setActiveSource with 'adsb'
    expect(setActiveSource).toHaveBeenCalledWith('adsb');

    // Dropdown should be closed
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('selecting the already-active source closes dropdown without calling setActiveSource', async () => {
    const setActiveSource = vi.fn();
    useFlightStore.setState({ setActiveSource });

    await renderSelector();

    // Open dropdown
    fireEvent.click(screen.getByRole('combobox'));

    // Click OpenSky (already active)
    const options = screen.getAllByRole('option');
    const openskyOption = options.find(o => o.textContent?.includes('OpenSky'));
    fireEvent.click(openskyOption!);

    // Should NOT call setActiveSource
    expect(setActiveSource).not.toHaveBeenCalled();

    // Dropdown should be closed
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('status badge shows flight count when connected', async () => {
    useFlightStore.setState({ connectionStatus: 'connected', flightCount: 247 });
    await renderSelector();

    expect(screen.getByText('247 flights')).toBeInTheDocument();
  });

  it('status badge shows "Rate limited" when rate_limited', async () => {
    useFlightStore.setState({ connectionStatus: 'rate_limited' });
    await renderSelector();

    expect(screen.getByText('Rate limited')).toBeInTheDocument();
  });

  it('status dot uses correct color class for each connection status', async () => {
    const statusClasses: Record<string, string> = {
      connected: 'bg-accent-green',
      stale: 'bg-accent-yellow',
      error: 'bg-accent-red',
      rate_limited: 'bg-accent-red',
      loading: 'bg-text-muted',
    };

    for (const [status, expectedClass] of Object.entries(statusClasses)) {
      useFlightStore.setState({ connectionStatus: status as import('@/stores/flightStore').ConnectionStatus });

      const { unmount } = await renderSelector();
      const dot = document.querySelector('[data-testid="status-dot"]');
      expect(dot, `dot should exist for status: ${status}`).toBeTruthy();
      expect(dot!.className, `expected ${expectedClass} for status: ${status}`).toContain(expectedClass);
      unmount();
    }
  });

  it('loading state shows pulsing dot', async () => {
    useFlightStore.setState({ connectionStatus: 'loading' });
    await renderSelector();

    const dot = document.querySelector('[data-testid="status-dot"]');
    expect(dot).toBeTruthy();
    expect(dot!.className).toContain('animate-pulse');
  });

  it('clicking outside the dropdown closes it', async () => {
    await renderSelector();

    // Open dropdown
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option')).toHaveLength(2);

    // Click outside (on document body)
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
