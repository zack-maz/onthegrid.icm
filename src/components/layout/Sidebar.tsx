import { useRef, useEffect, useState, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useFilterStore } from '@/stores/filterStore';
import { useSearchStore } from '@/stores/searchStore';
import { SidebarSection } from '@/components/layout/SidebarSection';
import { useCounterData } from '@/components/counters/useCounterData';
import { CounterRow } from '@/components/counters/CounterRow';
import { LayerTogglesContent } from '@/components/layout/LayerTogglesSlot';
import { FilterPanelContent } from '@/components/layout/FilterPanelSlot';
import { FilterChip } from '@/components/ui/FilterChip';
import type { CounterEntity } from '@/components/counters/useCounterData';
import type { SidebarSection as SidebarSectionType } from '@/types/ui';

/* SVG icons for the icon strip */
function BarChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="12" width="4" height="9" rx="1" />
      <rect x="10" y="7" width="4" height="14" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function FunnelIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}

const SECTIONS: { key: SidebarSectionType; label: string; icon: React.ReactNode }[] = [
  { key: 'counters', label: 'Counters', icon: <BarChartIcon /> },
  { key: 'layers', label: 'Layers', icon: <LayersIcon /> },
  { key: 'filters', label: 'Filters', icon: <FunnelIcon /> },
];

function CountersContent() {
  const counters = useCounterData();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const selectedEntityId = useUIStore((s) => s.selectedEntityId);

  const handleToggle = useCallback((key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  const handleEntityClick = useCallback((entity: CounterEntity) => {
    useNotificationStore.getState().setFlyToTarget({
      lng: entity.lng,
      lat: entity.lat,
      zoom: 10,
    });
    useUIStore.getState().selectEntity(entity.id);
    useUIStore.getState().openDetailPanel();
    // Dropdown stays open for quick jumping between entities
  }, []);

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Flights
      </div>
      <div className="mt-0.5 space-y-0.5">
        <CounterRow
          label="Unidentified"
          value={counters.unidentifiedFlights}
          entities={counters.entities.unidentifiedFlights}
          isExpanded={expandedKey === 'unidentified'}
          onToggle={() => handleToggle('unidentified')}
          onEntityClick={handleEntityClick}
          selectedEntityId={selectedEntityId}
        />
      </div>

      <div className="border-t border-border my-1.5" />

      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Ships
      </div>
      <div className="mt-0.5 space-y-0.5">
        <CounterRow
          label="Ships"
          value={counters.entities.ships.length}
          entities={counters.entities.ships}
          isExpanded={expandedKey === 'ships'}
          onToggle={() => handleToggle('ships')}
          onEntityClick={handleEntityClick}
          selectedEntityId={selectedEntityId}
        />
      </div>

      <div className="border-t border-border my-1.5" />

      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Events
      </div>
      <div className="mt-0.5 space-y-0.5">
        <CounterRow
          label="Airstrikes"
          value={counters.airstrikes}
          entities={counters.entities.airstrikeEvents}
          isExpanded={expandedKey === 'airstrikes'}
          onToggle={() => handleToggle('airstrikes')}
          onEntityClick={handleEntityClick}
          selectedEntityId={selectedEntityId}
        />
        <CounterRow
          label="Ground Combat"
          value={counters.groundCombat}
          entities={counters.entities.groundCombatEvents}
          isExpanded={expandedKey === 'groundCombat'}
          onToggle={() => handleToggle('groundCombat')}
          onEntityClick={handleEntityClick}
          selectedEntityId={selectedEntityId}
        />
        <CounterRow
          label="Targeted"
          value={counters.targeted}
          entities={counters.entities.targetedEvents}
          isExpanded={expandedKey === 'targeted'}
          onToggle={() => handleToggle('targeted')}
          onEntityClick={handleEntityClick}
          selectedEntityId={selectedEntityId}
        />
      </div>

      <div className="border-t border-border my-1.5" />

      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Struck Sites
      </div>
      <div className="mt-0.5 space-y-0.5">
        <CounterRow
          label="Nuclear"
          value={counters.hitSites.nuclear}
          entities={counters.entities.hitSites.nuclear}
          isExpanded={expandedKey === 'site-nuclear'}
          onToggle={() => handleToggle('site-nuclear')}
          onEntityClick={handleEntityClick}
          selectedEntityId={selectedEntityId}
        />
        <CounterRow
          label="Naval"
          value={counters.hitSites.naval}
          entities={counters.entities.hitSites.naval}
          isExpanded={expandedKey === 'site-naval'}
          onToggle={() => handleToggle('site-naval')}
          onEntityClick={handleEntityClick}
          selectedEntityId={selectedEntityId}
        />
        <CounterRow
          label="Oil"
          value={counters.hitSites.oil}
          entities={counters.entities.hitSites.oil}
          isExpanded={expandedKey === 'site-oil'}
          onToggle={() => handleToggle('site-oil')}
          onEntityClick={handleEntityClick}
          selectedEntityId={selectedEntityId}
        />
        <CounterRow
          label="Airbase"
          value={counters.hitSites.airbase}
          entities={counters.entities.hitSites.airbase}
          isExpanded={expandedKey === 'site-airbase'}
          onToggle={() => handleToggle('site-airbase')}
          onEntityClick={handleEntityClick}
          selectedEntityId={selectedEntityId}
        />
        <CounterRow
          label="Desalination"
          value={counters.hitSites.desalination}
          entities={counters.entities.hitSites.desalination}
          isExpanded={expandedKey === 'site-desalination'}
          onToggle={() => handleToggle('site-desalination')}
          onEntityClick={handleEntityClick}
          selectedEntityId={selectedEntityId}
        />
        <CounterRow
          label="Port"
          value={counters.hitSites.port}
          entities={counters.entities.hitSites.port}
          isExpanded={expandedKey === 'site-port'}
          onToggle={() => handleToggle('site-port')}
          onEntityClick={handleEntityClick}
          selectedEntityId={selectedEntityId}
        />
      </div>
    </div>
  );
}

export function Sidebar() {
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const activeSidebarSection = useUIStore((s) => s.activeSidebarSection);
  const openSidebarSection = useUIStore((s) => s.openSidebarSection);
  const isCountersCollapsed = useUIStore((s) => s.isCountersCollapsed);
  const isLayersCollapsed = useUIStore((s) => s.isLayersCollapsed);
  const isFiltersCollapsed = useUIStore((s) => s.isFiltersCollapsed);
  const toggleCounters = useUIStore((s) => s.toggleCounters);
  const toggleLayers = useUIStore((s) => s.toggleLayers);
  const toggleFilters = useUIStore((s) => s.toggleFilters);
  const activeFilterCount = useFilterStore((s) => s.activeFilterCount);
  const clearAll = useFilterStore((s) => s.clearAll);
  const isFilterMode = useSearchStore((s) => s.isFilterMode);
  const searchQuery = useSearchStore((s) => s.query);

  const countersRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  const sectionRefs: Record<SidebarSectionType, React.RefObject<HTMLDivElement | null>> = {
    counters: countersRef,
    layers: layersRef,
    filters: filtersRef,
  };

  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll to the active section within the sidebar content panel
  useEffect(() => {
    if (activeSidebarSection && isSidebarOpen) {
      const ref = sectionRefs[activeSidebarSection];
      const container = contentRef.current;
      if (ref.current && container) {
        const top = ref.current.offsetTop;
        container.scrollTo({ top, behavior: 'smooth' });
      }
    }
  }, [activeSidebarSection, isSidebarOpen]);

  const filterCount = activeFilterCount();

  return (
    <div
      data-testid="sidebar"
      className="absolute left-0 z-[var(--z-controls)] flex pointer-events-none"
      style={{ top: 'var(--height-topbar)', height: 'calc(100vh - var(--height-topbar))' }}
    >
      {/* Icon strip - always visible */}
      <div
        data-testid="sidebar-icon-strip"
        className="pointer-events-auto flex w-[var(--width-icon-strip)] flex-col items-center gap-1 border-r border-border bg-surface-overlay pt-2 backdrop-blur-sm"
      >
        {SECTIONS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => openSidebarSection(key)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
              activeSidebarSection === key && isSidebarOpen
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'text-text-muted hover:bg-white/5 hover:text-text-secondary'
            }`}
            aria-label={label}
            title={label}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Content panel - slides in/out */}
      <div
        ref={contentRef}
        data-testid="sidebar-content"
        className={`pointer-events-auto w-[var(--width-sidebar)] border-r border-border bg-surface-overlay backdrop-blur-sm overflow-y-auto transition-all duration-300 ease-in-out ${
          isSidebarOpen
            ? 'translate-x-0 opacity-100'
            : '-translate-x-full opacity-0 !pointer-events-none'
        }`}
      >
        <div className="px-3 py-2 flex flex-col gap-1">
          {/* Counters section */}
          <div ref={countersRef}>
            <SidebarSection
              id="counters"
              title="Counters"
              icon={<BarChartIcon />}
              isOpen={!isCountersCollapsed}
              onToggle={toggleCounters}
            >
              <CountersContent />
            </SidebarSection>
          </div>

          <div className="border-t border-border" />

          {/* Layers section */}
          <div ref={layersRef}>
            <SidebarSection
              id="layers"
              title="Layers"
              icon={<LayersIcon />}
              isOpen={!isLayersCollapsed}
              onToggle={toggleLayers}
            >
              <LayerTogglesContent />
            </SidebarSection>
          </div>

          <div className="border-t border-border" />

          {/* Filters section */}
          <div ref={filtersRef}>
            <SidebarSection
              id="filters"
              title={filterCount > 0 ? `Filters (${filterCount})` : 'Filters'}
              icon={<FunnelIcon />}
              isOpen={!isFiltersCollapsed}
              onToggle={toggleFilters}
            >
              {isFilterMode && searchQuery && (
                <div className="mb-2">
                  <FilterChip
                    label={searchQuery}
                    onClear={() => useSearchStore.getState().clearSearch()}
                  />
                </div>
              )}
              {filterCount > 0 && (
                <button
                  onClick={clearAll}
                  className="mb-2 text-[10px] text-accent-red hover:underline"
                >
                  Reset All
                </button>
              )}
              <FilterPanelContent />
            </SidebarSection>
          </div>
        </div>
      </div>
    </div>
  );
}
