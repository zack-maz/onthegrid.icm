import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useNotificationStore } from '@/stores/notificationStore';
import type { Notification } from '@/stores/notificationStore';

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

function makeNotification(id: string, overrides: Partial<Notification> = {}): Notification {
  return {
    id,
    title: `Breaking news ${id}`,
    url: `https://example.com/${id}`,
    source: 'BBC',
    sourceCount: 2,
    articleCount: 3,
    keywords: ['airstrike', 'iran'],
    timestamp: Date.now(),
    lastUpdated: Date.now(),
    ...overrides,
  };
}

describe('notificationStore', () => {
  beforeEach(() => {
    const store = useNotificationStore.getState();
    store.setNotifications([]);
    useNotificationStore.setState({
      readIds: new Set(),
      unreadCount: 0,
      isDropdownOpen: false,
      flyToTarget: null,
    });
    Object.keys(storage).forEach((k) => delete storage[k]);
  });

  it('setNotifications updates notifications and computes correct unreadCount', () => {
    const notifications = [makeNotification('n1'), makeNotification('n2'), makeNotification('n3')];
    useNotificationStore.getState().setNotifications(notifications);

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(3);
    expect(state.unreadCount).toBe(3);
  });

  it('markRead adds id to readIds and decrements count', () => {
    const notifications = [makeNotification('n1'), makeNotification('n2')];
    useNotificationStore.getState().setNotifications(notifications);

    useNotificationStore.getState().markRead('n1');

    const state = useNotificationStore.getState();
    expect(state.readIds.has('n1')).toBe(true);
    expect(state.unreadCount).toBe(1);
  });

  it('markRead persists to localStorage', () => {
    const notifications = [makeNotification('n1')];
    useNotificationStore.getState().setNotifications(notifications);

    useNotificationStore.getState().markRead('n1');

    const stored = JSON.parse(storage['notificationReadIds']);
    expect(stored).toContain('n1');
  });

  it('markRead is idempotent (does not double-decrement)', () => {
    const notifications = [makeNotification('n1'), makeNotification('n2')];
    useNotificationStore.getState().setNotifications(notifications);

    useNotificationStore.getState().markRead('n1');
    useNotificationStore.getState().markRead('n1');

    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it('markAllRead sets unreadCount to 0 and persists', () => {
    const notifications = [makeNotification('n1'), makeNotification('n2'), makeNotification('n3')];
    useNotificationStore.getState().setNotifications(notifications);

    useNotificationStore.getState().markAllRead();

    const state = useNotificationStore.getState();
    expect(state.unreadCount).toBe(0);
    expect(state.readIds.has('n1')).toBe(true);
    expect(state.readIds.has('n2')).toBe(true);
    expect(state.readIds.has('n3')).toBe(true);

    const stored = JSON.parse(storage['notificationReadIds']);
    expect(stored).toContain('n1');
    expect(stored).toContain('n2');
    expect(stored).toContain('n3');
  });

  it('readIds survive setNotifications (stale read state)', () => {
    const notifications = [makeNotification('n1'), makeNotification('n2')];
    useNotificationStore.getState().setNotifications(notifications);
    useNotificationStore.getState().markRead('n1');

    // Simulate a poll cycle delivering the same clusters again
    useNotificationStore.getState().setNotifications(notifications);

    const state = useNotificationStore.getState();
    expect(state.readIds.has('n1')).toBe(true);
    expect(state.unreadCount).toBe(1);
  });

  it('prunes readIds for notifications that no longer exist', () => {
    const notifications = [makeNotification('n1'), makeNotification('n2')];
    useNotificationStore.getState().setNotifications(notifications);
    useNotificationStore.getState().markRead('n1');
    useNotificationStore.getState().markRead('n2');

    // New poll cycle without n1
    useNotificationStore.getState().setNotifications([makeNotification('n2')]);

    const state = useNotificationStore.getState();
    expect(state.readIds.has('n1')).toBe(false);
    expect(state.readIds.has('n2')).toBe(true);
  });

  it('toggleDropdown toggles isDropdownOpen', () => {
    expect(useNotificationStore.getState().isDropdownOpen).toBe(false);

    useNotificationStore.getState().toggleDropdown();
    expect(useNotificationStore.getState().isDropdownOpen).toBe(true);

    useNotificationStore.getState().toggleDropdown();
    expect(useNotificationStore.getState().isDropdownOpen).toBe(false);
  });

  it('closeDropdown sets isDropdownOpen to false', () => {
    useNotificationStore.getState().toggleDropdown();
    useNotificationStore.getState().closeDropdown();
    expect(useNotificationStore.getState().isDropdownOpen).toBe(false);
  });

  it('setFlyToTarget sets and clears the target', () => {
    const target = { lng: 51.39, lat: 35.69, zoom: 10 };

    useNotificationStore.getState().setFlyToTarget(target);
    expect(useNotificationStore.getState().flyToTarget).toEqual(target);

    useNotificationStore.getState().setFlyToTarget(null);
    expect(useNotificationStore.getState().flyToTarget).toBeNull();
  });
});
