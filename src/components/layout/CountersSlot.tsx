// DEPRECATED: CountersSlot is no longer rendered in production.
// Sidebar's CountersContent is the active implementation.
// Kept for backward compatibility and test coverage.

import { useState, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { OverlayPanel } from '@/components/ui/OverlayPanel';
import { useCounterData } from '@/components/counters/useCounterData';
import { CounterRow } from '@/components/counters/CounterRow';
import type { CounterEntity } from '@/components/counters/useCounterData';

export function CountersSlot() {
  const isCollapsed = useUIStore((s) => s.isCountersCollapsed);
  const toggleCounters = useUIStore((s) => s.toggleCounters);
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
  }, []);

  return (
    <div data-testid="counters-slot">
      <OverlayPanel>
        <button
          onClick={toggleCounters}
          className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          <span>Counters</span>
          <span className="text-text-muted">{isCollapsed ? '+' : '-'}</span>
        </button>
        {!isCollapsed && (
          <div className="mt-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Flights
            </div>
            <div className="mt-0.5 space-y-0.5">
              <CounterRow
                label="Flights"
                value={counters.totalFlights}
                entities={counters.entities.flights}
                isExpanded={expandedKey === 'flights'}
                onToggle={() => handleToggle('flights')}
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
              Sites
            </div>
            <div className="mt-0.5 space-y-0.5">
              <CounterRow
                label="Nuclear"
                value={counters.sites.nuclear}
                entities={counters.entities.sites.nuclear}
                isExpanded={expandedKey === 'site-nuclear'}
                onToggle={() => handleToggle('site-nuclear')}
                onEntityClick={handleEntityClick}
                selectedEntityId={selectedEntityId}
              />
              <CounterRow
                label="Naval"
                value={counters.sites.naval}
                entities={counters.entities.sites.naval}
                isExpanded={expandedKey === 'site-naval'}
                onToggle={() => handleToggle('site-naval')}
                onEntityClick={handleEntityClick}
                selectedEntityId={selectedEntityId}
              />
              <CounterRow
                label="Oil"
                value={counters.sites.oil}
                entities={counters.entities.sites.oil}
                isExpanded={expandedKey === 'site-oil'}
                onToggle={() => handleToggle('site-oil')}
                onEntityClick={handleEntityClick}
                selectedEntityId={selectedEntityId}
              />
              <CounterRow
                label="Airbase"
                value={counters.sites.airbase}
                entities={counters.entities.sites.airbase}
                isExpanded={expandedKey === 'site-airbase'}
                onToggle={() => handleToggle('site-airbase')}
                onEntityClick={handleEntityClick}
                selectedEntityId={selectedEntityId}
              />
              <CounterRow
                label="Desalination"
                value={counters.sites.desalination}
                entities={counters.entities.sites.desalination}
                isExpanded={expandedKey === 'site-desalination'}
                onToggle={() => handleToggle('site-desalination')}
                onEntityClick={handleEntityClick}
                selectedEntityId={selectedEntityId}
              />
              <CounterRow
                label="Port"
                value={counters.sites.port}
                entities={counters.entities.sites.port}
                isExpanded={expandedKey === 'site-port'}
                onToggle={() => handleToggle('site-port')}
                onEntityClick={handleEntityClick}
                selectedEntityId={selectedEntityId}
              />
            </div>
          </div>
        )}
      </OverlayPanel>
    </div>
  );
}
