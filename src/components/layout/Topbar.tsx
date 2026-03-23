import { useCallback } from 'react';
import { StatusDropdown } from '@/components/layout/StatusDropdown';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { SearchModal } from '@/components/search/SearchModal';
import { useSearchStore } from '@/stores/searchStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useLayerStore } from '@/stores/layerStore';
import { INITIAL_VIEW_STATE } from '@/components/map/constants';

function ResetButton() {
  const handleReset = useCallback(() => {
    // Reset UI state
    useUIStore.setState({
      selectedEntityId: null,
      hoveredEntityId: null,
      isDetailPanelOpen: false,
      expandedAlertSiteId: null,
    });

    // Reset visualization layers to defaults
    useLayerStore.getState().resetLayers();

    // Reset all filters
    useFilterStore.getState().clearAll();

    // Reset camera to initial view
    useNotificationStore.getState().setFlyToTarget({
      lng: INITIAL_VIEW_STATE.longitude,
      lat: INITIAL_VIEW_STATE.latitude,
      zoom: INITIAL_VIEW_STATE.zoom,
      pitch: INITIAL_VIEW_STATE.pitch,
      bearing: INITIAL_VIEW_STATE.bearing,
    });

    // In dev mode, reload the page
    if (import.meta.env.DEV) {
      setTimeout(() => window.location.reload(), 100);
    }
  }, []);

  return (
    <button
      data-testid="reset-button"
      onClick={handleReset}
      className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-white/5 hover:text-text-secondary transition-colors"
      title="Reset all settings"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12a9 9 0 1 1 9 9" />
        <polyline points="1 7 3 12 8 10" />
      </svg>
    </button>
  );
}

export function Topbar() {
  return (
    <header
      data-testid="topbar"
      className="relative z-[var(--z-controls)] flex h-[var(--height-topbar)] w-full items-center justify-between border-b border-border bg-surface-overlay px-4 backdrop-blur-sm"
    >
      {/* Left: Status dropdown with title */}
      <StatusDropdown />

      {/* Center: Search hint */}
      <button
        data-testid="topbar-search-hint"
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-text-muted hover:bg-white/5 transition-colors"
        aria-label="Open search"
        onClick={() => useSearchStore.getState().openSearchModal()}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <kbd className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
          Cmd+K
        </kbd>
      </button>

      {/* Right: Reset + Notification bell */}
      <div className="flex items-center gap-1">
        <ResetButton />
        <NotificationBell />
      </div>

      {/* Search modal overlay (z-modal renders above everything) */}
      <SearchModal />
    </header>
  );
}
