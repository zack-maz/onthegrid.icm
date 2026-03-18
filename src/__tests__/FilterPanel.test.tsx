import { render, screen, fireEvent } from '@testing-library/react';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';

import { FilterPanelSlot } from '@/components/layout/FilterPanelSlot';

describe('FilterPanelSlot', () => {
  beforeEach(() => {
    useUIStore.setState({
      isFiltersCollapsed: true,
      isFlightFiltersOpen: true,
      isShipFiltersOpen: true,
      isEventFiltersOpen: true,
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

  it('renders collapsed by default with "Filters" header', () => {
    render(<FilterPanelSlot />);
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.queryByText('Flights')).not.toBeInTheDocument();
  });

  it('expanding shows entity section headers', () => {
    useUIStore.setState({ isFiltersCollapsed: false });
    render(<FilterPanelSlot />);
    expect(screen.getByText('Flights')).toBeInTheDocument();
    expect(screen.getByText('Ships')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
  });

  it('proximity section appears at top level (outside entity sections)', () => {
    useUIStore.setState({ isFiltersCollapsed: false });
    render(<FilterPanelSlot />);
    expect(screen.getAllByText('Proximity').length).toBeGreaterThanOrEqual(1);
  });

  it('shows badge count when filters are active (max 7)', () => {
    useFilterStore.setState({ flightCountries: ['Iran'] });
    useUIStore.setState({ isFiltersCollapsed: false });
    render(<FilterPanelSlot />);
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('shows "Clear all filters" when filters are active', () => {
    useFilterStore.setState({ flightCountries: ['Iran'] });
    useUIStore.setState({ isFiltersCollapsed: false });
    render(<FilterPanelSlot />);
    expect(screen.getByText('Clear all filters')).toBeInTheDocument();
  });

  it('does not show "Clear all filters" when no filters active', () => {
    useUIStore.setState({ isFiltersCollapsed: false });
    render(<FilterPanelSlot />);
    expect(screen.queryByText('Clear all filters')).not.toBeInTheDocument();
  });

  it('entity sections are collapsible', () => {
    useUIStore.setState({ isFiltersCollapsed: false, isFlightFiltersOpen: true });
    render(<FilterPanelSlot />);
    // Flight section header visible and content visible
    expect(screen.getByText('Flights')).toBeInTheDocument();
    // Two "Country" sub-headers visible (one in Flights, one in Events)
    expect(screen.getAllByText('Country').length).toBe(2);
    // Collapse flights section
    fireEvent.click(screen.getByText('Flights'));
    // Only one "Country" remains (Events section)
    expect(screen.getAllByText('Country').length).toBe(1);
  });

  it('clicking header toggles panel expansion', () => {
    render(<FilterPanelSlot />);
    expect(screen.queryByText('Flights')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Filters'));
    expect(screen.getByText('Flights')).toBeInTheDocument();
  });

  it('has data-testid attribute', () => {
    render(<FilterPanelSlot />);
    expect(screen.getByTestId('filter-panel-slot')).toBeInTheDocument();
  });

  it('update filter field names: flightCountries, eventCountries are used', () => {
    useFilterStore.setState({ flightCountries: ['Iran'], eventCountries: ['ISRAEL'] });
    useUIStore.setState({ isFiltersCollapsed: false });
    render(<FilterPanelSlot />);
    // Both country sections active
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });
});
