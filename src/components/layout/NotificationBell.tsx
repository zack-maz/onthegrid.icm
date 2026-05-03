import { useRef, useEffect, useCallback } from 'react';

import { NotificationDropdown } from '@/components/notifications/NotificationDropdown';
import { useNotificationStore } from '@/stores/notificationStore';

export function NotificationBell() {
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const isDropdownOpen = useNotificationStore((s) => s.isDropdownOpen);
  const toggleDropdown = useNotificationStore((s) => s.toggleDropdown);
  const closeDropdown = useNotificationStore((s) => s.closeDropdown);
  const containerRef = useRef<HTMLDivElement>(null);

  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);
  const ariaLabel = unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications';

  // Outside-click handler (Escape moved to centralized useEscapeKeyHandler)
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    },
    [closeDropdown],
  );

  useEffect(() => {
    if (!isDropdownOpen) return;
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isDropdownOpen, handleMouseDown]);

  return (
    <div ref={containerRef} className="relative" data-testid="notification-bell">
      <button
        onClick={toggleDropdown}
        className="relative rounded-lg border border-border bg-surface-overlay p-2 shadow-lg backdrop-blur-sm hover:bg-white/5 transition-colors"
        aria-label={ariaLabel}
      >
        {/* Bell SVG icon */}
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-text-secondary"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-red px-1 text-[10px] font-bold text-white"
            data-testid="notification-badge"
          >
            {badgeText}
          </span>
        )}
      </button>

      {isDropdownOpen && <NotificationDropdown />}
    </div>
  );
}
