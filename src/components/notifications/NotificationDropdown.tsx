import { useMemo } from 'react';

import { getTimeGroup, TIME_GROUP_LABELS, TIME_GROUP_ORDER } from '@/lib/timeGroup';
import type { TimeGroup } from '@/lib/timeGroup';
import { useNotificationStore } from '@/stores/notificationStore';
import type { Notification } from '@/stores/notificationStore';

import { NotificationCard } from './NotificationCard';

export function NotificationDropdown() {
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAllRead = useNotificationStore((s) => s.markAllRead);

  // Group notifications by time bucket, maintaining score-descending order within groups
  const grouped = useMemo(() => {
    const groups = new Map<TimeGroup, Notification[]>();
    for (const group of TIME_GROUP_ORDER) {
      groups.set(group, []);
    }
    for (const n of notifications) {
      const group = getTimeGroup(n.timestamp);
      groups.get(group)?.push(n);
    }
    return groups;
  }, [notifications]);

  return (
    <div
      className="absolute top-full right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg border border-border bg-surface-overlay shadow-xl backdrop-blur-sm z-[var(--z-modal)]"
      data-testid="notification-dropdown"
    >
      {/* Header */}
      <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface-overlay px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Notifications
        </span>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-[10px] text-accent-blue hover:underline cursor-pointer"
            data-testid="mark-all-read"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Body */}
      {notifications.length === 0 ? (
        <div className="px-3 py-8 text-center text-xs text-text-muted">No recent notifications</div>
      ) : (
        <div>
          {TIME_GROUP_ORDER.map((group) => {
            const items = grouped.get(group);
            if (!items || items.length === 0) return null;
            return (
              <div key={group}>
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-muted">
                  {TIME_GROUP_LABELS[group]}
                </div>
                {items.map((n) => (
                  <NotificationCard key={n.id} notification={n} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
