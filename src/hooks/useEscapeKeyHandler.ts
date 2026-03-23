import { useEffect } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import { INITIAL_VIEW_STATE } from '@/components/map/constants';

/**
 * Centralized Escape key handler with priority stack:
 * 1. Search modal open -> close search modal
 * 2. Search filter active -> clear search filter
 * 3. Notification dropdown open -> close dropdown
 * 4. Expanded proximity alert -> collapse alert
 * 5. Detail panel open -> close detail panel + deselect entity
 * 6. Proximity pin active -> clear proximity pin
 * 7. Sidebar open -> close sidebar
 * 8. Markets panel expanded -> collapse markets
 * 9. Reset camera to initial position
 *
 * Only one action fires per keypress. Mounted once in AppShell.
 */
export function useEscapeKeyHandler() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;

      // Priority 1: Close search modal
      if (useSearchStore.getState().isSearchModalOpen) {
        useSearchStore.getState().closeSearchModal();
        return;
      }

      // Priority 2: Clear search filter
      if (useSearchStore.getState().isFilterMode) {
        useSearchStore.getState().clearSearch();
        return;
      }

      // Priority 3: Close notification dropdown
      if (useNotificationStore.getState().isDropdownOpen) {
        useNotificationStore.getState().closeDropdown();
        return;
      }

      // Priority 4: Collapse expanded proximity alert
      if (useUIStore.getState().expandedAlertSiteId !== null) {
        useUIStore.getState().setExpandedAlertSiteId(null);
        return;
      }

      // Priority 5: Close detail panel and deselect entity
      if (useUIStore.getState().isDetailPanelOpen) {
        useUIStore.getState().closeDetailPanel();
        useUIStore.getState().selectEntity(null);
        return;
      }

      // Priority 6: Clear proximity pin
      if (useFilterStore.getState().proximityPin !== null) {
        useFilterStore.getState().clearFilter('proximity');
        return;
      }

      // Priority 7: Close sidebar
      if (useUIStore.getState().isSidebarOpen) {
        useUIStore.getState().closeSidebar();
        return;
      }

      // Priority 8: Collapse markets panel
      if (!useUIStore.getState().isMarketsCollapsed) {
        useUIStore.getState().collapseMarkets();
        return;
      }

      // Priority 9: Reset camera to initial position
      useNotificationStore.getState().setFlyToTarget({
        lng: INITIAL_VIEW_STATE.longitude,
        lat: INITIAL_VIEW_STATE.latitude,
        zoom: INITIAL_VIEW_STATE.zoom,
        pitch: INITIAL_VIEW_STATE.pitch,
        bearing: INITIAL_VIEW_STATE.bearing,
      });
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
