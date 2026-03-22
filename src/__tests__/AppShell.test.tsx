import { render, screen } from '@testing-library/react';
import { AppShell } from '@/components/layout/AppShell';

describe('AppShell', () => {
  it('renders map container region', () => {
    render(<AppShell />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('renders Topbar', () => {
    render(<AppShell />);
    expect(screen.getByTestId('topbar')).toBeInTheDocument();
  });

  it('renders Topbar search hint', () => {
    render(<AppShell />);
    expect(screen.getByTestId('topbar-search-hint')).toBeInTheDocument();
  });

  it('renders Topbar status dropdown', () => {
    render(<AppShell />);
    expect(screen.getByTestId('topbar-status')).toBeInTheDocument();
  });

  it('renders Sidebar', () => {
    render(<AppShell />);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('renders Sidebar icon strip with 3 icon buttons', () => {
    render(<AppShell />);
    const iconStrip = screen.getByTestId('sidebar-icon-strip');
    expect(iconStrip).toBeInTheDocument();
    const buttons = iconStrip.querySelectorAll('button');
    expect(buttons.length).toBe(3);
  });

  it('renders Sidebar content panel', () => {
    render(<AppShell />);
    expect(screen.getByTestId('sidebar-content')).toBeInTheDocument();
  });

  it('renders detail panel slot', () => {
    render(<AppShell />);
    expect(screen.getByTestId('detail-panel-slot')).toBeInTheDocument();
  });

  it('renders notification bell in topbar', () => {
    render(<AppShell />);
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
  });

  it('renders UTC clock', () => {
    render(<AppShell />);
    expect(screen.getByTestId('utc-clock')).toBeInTheDocument();
  });

  it('does not render old floating TitleSlot', () => {
    render(<AppShell />);
    expect(screen.queryByTestId('title-slot')).not.toBeInTheDocument();
  });
});
