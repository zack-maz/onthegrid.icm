import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { NotificationBell } from '@/components/layout/NotificationBell';
import { useNotificationStore } from '@/stores/notificationStore';

// Mock localStorage
const storage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => {
    storage[key] = value;
  },
  removeItem: (key: string) => {
    delete storage[key];
  },
});

describe('NotificationBell', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      notifications: [],
      readIds: new Set(),
      isDropdownOpen: false,
      unreadCount: 0,
      flyToTarget: null,
    });
    Object.keys(storage).forEach((k) => delete storage[k]);
  });

  it('renders bell with correct aria-label when no unread', () => {
    render(<NotificationBell />);
    const button = screen.getByRole('button', { name: 'Notifications' });
    expect(button).toBeInTheDocument();
  });

  it('renders bell with unread count in aria-label', () => {
    useNotificationStore.setState({ unreadCount: 5 });
    render(<NotificationBell />);
    const button = screen.getByRole('button', { name: 'Notifications (5 unread)' });
    expect(button).toBeInTheDocument();
  });

  it('shows badge with unread count', () => {
    useNotificationStore.setState({ unreadCount: 3 });
    render(<NotificationBell />);
    const badge = screen.getByTestId('notification-badge');
    expect(badge).toHaveTextContent('3');
  });

  it('shows 99+ when count exceeds 99', () => {
    useNotificationStore.setState({ unreadCount: 150 });
    render(<NotificationBell />);
    const badge = screen.getByTestId('notification-badge');
    expect(badge).toHaveTextContent('99+');
  });

  it('hides badge when unreadCount is 0', () => {
    useNotificationStore.setState({ unreadCount: 0 });
    render(<NotificationBell />);
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
  });

  it('toggles dropdown visibility on click', () => {
    useNotificationStore.setState({ unreadCount: 1 });
    render(<NotificationBell />);

    // Initially closed
    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));
    expect(screen.getByTestId('notification-dropdown')).toBeInTheDocument();

    // Click again to close
    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));
    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument();
  });

  it('closes dropdown on Escape key (via centralized handler / store action)', () => {
    useNotificationStore.setState({ isDropdownOpen: true, unreadCount: 1 });
    render(<NotificationBell />);
    expect(screen.getByTestId('notification-dropdown')).toBeInTheDocument();

    // Escape is now handled by centralized useEscapeKeyHandler in AppShell.
    // Verify the store action works correctly.
    act(() => {
      useNotificationStore.getState().closeDropdown();
    });
    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument();
  });
});
