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

  it('renders counters slot in top-right', () => {
    render(<AppShell />);
    expect(screen.getByTestId('counters-slot')).toBeInTheDocument();
  });

  it('renders layer toggles slot in top-right', () => {
    render(<AppShell />);
    expect(screen.getByTestId('layer-toggles-slot')).toBeInTheDocument();
  });

  it('renders filters slot in bottom-left', () => {
    render(<AppShell />);
    expect(screen.getByTestId('filters-slot')).toBeInTheDocument();
  });

  it('renders detail panel slot', () => {
    render(<AppShell />);
    expect(screen.getByTestId('detail-panel-slot')).toBeInTheDocument();
  });
});
