import { render, screen } from '@testing-library/react';
import { AppShell } from '@/components/layout/AppShell';

describe('AppShell', () => {
  it('renders map container region', () => {
    render(<AppShell />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('renders title slot in top-left', () => {
    render(<AppShell />);
    expect(screen.getByTestId('title-slot')).toBeInTheDocument();
  });

  it('renders counters slot', () => {
    render(<AppShell />);
    expect(screen.getByTestId('counters-slot')).toBeInTheDocument();
  });

  it('renders layer toggles slot', () => {
    render(<AppShell />);
    expect(screen.getByTestId('layer-toggles-slot')).toBeInTheDocument();
  });

it('renders detail panel slot', () => {
    render(<AppShell />);
    expect(screen.getByTestId('detail-panel-slot')).toBeInTheDocument();
  });

  it('renders StatusPanel instead of SourceSelector', () => {
    render(<AppShell />);
    expect(screen.getByTestId('status-dot-flights')).toBeInTheDocument();
  });

  it('does not render SourceSelector', () => {
    render(<AppShell />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
