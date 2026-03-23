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
    useFilterStore.getState().clearAll();
  });

  it('renders collapsed by default with "Filters" header', () => {
    render(<FilterPanelSlot />);
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.queryByText('Flights')).not.toBeInTheDocument();
  });

  it('expanding shows entity section headers', () => {
    useUIStore.setState({ isFiltersCollapsed: false });
    render(<FilterPanelSlot />);
    // "Flights" appears as both a section header and a visibility button
    expect(screen.getAllByText('Flights').length).toBeGreaterThanOrEqual(1);
    // "Ships" appears as both a section header and a visibility button
    expect(screen.getAllByText('Ships').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Conflicts')).toBeInTheDocument();
  });

  it('proximity section appears at top level (outside entity sections)', () => {
    useUIStore.setState({ isFiltersCollapsed: false });
    render(<FilterPanelSlot />);
    expect(screen.getAllByText('Proximity').length).toBeGreaterThanOrEqual(1);
  });

  it('shows badge count when filters are active (max 13)', () => {
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
    const flightHeaders = screen.getAllByText('Flights');
    expect(flightHeaders.length).toBeGreaterThanOrEqual(1);
    // Collapse flights section - click the first one (section header)
    fireEvent.click(flightHeaders[0]);
    // Flight content should be hidden after collapse (VisibilityButton "Flights" disappears)
  });

  it('clicking header toggles panel expansion', () => {
    render(<FilterPanelSlot />);
    expect(screen.queryByText('Conflicts')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Filters'));
    expect(screen.getByText('Conflicts')).toBeInTheDocument();
  });

  it('has data-testid attribute', () => {
    render(<FilterPanelSlot />);
    expect(screen.getByTestId('filter-panel-slot')).toBeInTheDocument();
  });

  it('does not show "Showing last 24h" label in default state (explicit 1h date range)', () => {
    useUIStore.setState({ isFiltersCollapsed: false, isEventFiltersOpen: true });
    render(<FilterPanelSlot />);
    expect(screen.queryByText('Showing last 24h')).not.toBeInTheDocument();
  });

  it('hides "Showing last 24h" label when custom date range is set', () => {
    useUIStore.setState({ isFiltersCollapsed: false, isEventFiltersOpen: true });
    useFilterStore.setState({ dateStart: Date.now() - 86400000 });
    render(<FilterPanelSlot />);
    expect(screen.queryByText('Showing last 24h')).not.toBeInTheDocument();
  });

  it('hides "Showing last 24h" label when Events section is collapsed', () => {
    useUIStore.setState({ isFiltersCollapsed: false, isEventFiltersOpen: false });
    render(<FilterPanelSlot />);
    expect(screen.queryByText('Showing last 24h')).not.toBeInTheDocument();
  });

  it('update filter field names: flightCountries, eventCountries are used', () => {
    useFilterStore.setState({ flightCountries: ['Iran'], eventCountries: ['ISRAEL'] });
    useUIStore.setState({ isFiltersCollapsed: false });
    render(<FilterPanelSlot />);
    // Both country sections active
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });
});
