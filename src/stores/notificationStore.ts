import { create } from 'zustand';

export interface Notification {
  id: string; // cluster ID
  title: string;
  url: string;
  source: string; // primary article source
  sourceCount: number; // distinct sources in cluster
  articleCount: number; // total articles in cluster
  keywords: string[];
  timestamp: number; // cluster firstSeen
  lastUpdated: number;
}

export interface FlyToTarget {
  lng: number;
  lat: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
}

interface NotificationState {
  notifications: Notification[];
  readIds: Set<string>;
  isDropdownOpen: boolean;
  unreadCount: number;
  flyToTarget: FlyToTarget | null;
  setNotifications: (notifications: Notification[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  toggleDropdown: () => void;
  closeDropdown: () => void;
  setFlyToTarget: (target: FlyToTarget | null) => void;
}

const STORAGE_KEY = 'notificationReadIds';

function loadReadIds(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const arr = JSON.parse(stored) as string[];
      return new Set(arr);
    }
  } catch {
    /* localStorage unavailable or corrupted JSON */
  }
  return new Set();
}

function persistReadIds(readIds: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...readIds]));
  } catch {
    /* silently fail */
  }
}

const initialReadIds = loadReadIds();

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  readIds: initialReadIds,
  isDropdownOpen: false,
  unreadCount: 0,
  flyToTarget: null,

  setNotifications: (notifications) => {
    const { readIds } = get();
    // Prune readIds that no longer match any current notification
    const currentIds = new Set(notifications.map((n) => n.id));
    let pruned = false;
    const nextReadIds = new Set<string>();
    for (const id of readIds) {
      if (currentIds.has(id)) {
        nextReadIds.add(id);
      } else {
        pruned = true;
      }
    }
    if (pruned) {
      persistReadIds(nextReadIds);
    }
    const unreadCount = notifications.filter((n) => !nextReadIds.has(n.id)).length;
    set({
      notifications,
      unreadCount,
      ...(pruned ? { readIds: nextReadIds } : {}),
    });
  },

  markRead: (id) => {
    const { readIds, unreadCount } = get();
    if (readIds.has(id)) return;
    const next = new Set(readIds);
    next.add(id);
    persistReadIds(next);
    set({ readIds: next, unreadCount: Math.max(0, unreadCount - 1) });
  },

  markAllRead: () => {
    const { notifications, readIds } = get();
    const next = new Set(readIds);
    for (const n of notifications) {
      next.add(n.id);
    }
    persistReadIds(next);
    set({ readIds: next, unreadCount: 0 });
  },

  toggleDropdown: () => set((s) => ({ isDropdownOpen: !s.isDropdownOpen })),

  closeDropdown: () => set({ isDropdownOpen: false }),

  setFlyToTarget: (target) => set({ flyToTarget: target }),
}));
