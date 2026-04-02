import { useState } from 'react';
import type { SiteEntity } from '@/types/entities';
import { SITE_TYPE_LABELS, EVENT_TYPE_LABELS } from '@/types/ui';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { useUIStore } from '@/stores/uiStore';
import { getCurrentPanelView } from '@/lib/panelLabel';
import { computeAttackStatus } from '@/lib/attackStatus';
import { useSiteImage } from '@/hooks/useSiteImage';
import { DetailValue } from './DetailValue';

interface SiteDetailProps {
  entity: SiteEntity;
}

const MAX_VISIBLE_ATTACKS = 5;

export function SiteDetail({ entity }: SiteDetailProps) {
  const events = useEventStore((s) => s.events);
  const dateEnd = useFilterStore((s) => s.dateEnd);
  const selectEntity = useUIStore((s) => s.selectEntity);
  const openDetailPanel = useUIStore((s) => s.openDetailPanel);

  const attack = computeAttackStatus(entity, events, dateEnd);
  const typeLabel = SITE_TYPE_LABELS[entity.siteType] ?? entity.siteType;
  const osmUrl = `https://www.openstreetmap.org/?mlat=${entity.lat}&mlon=${entity.lng}#map=15/${entity.lat}/${entity.lng}`;
  const imageUrl = useSiteImage(entity.lat, entity.lng);

  const [showAll, setShowAll] = useState(false);
  const [imgError, setImgError] = useState(false);
  const visibleAttacks = showAll ? attack.attacks : attack.attacks.slice(0, MAX_VISIBLE_ATTACKS);

  return (
    <div className="flex flex-col gap-1">
      {/* Site thumbnail */}
      {imageUrl && !imgError && (
        <div className="relative -mx-3 -mt-1 mb-2 overflow-hidden rounded-b-lg">
          <img
            src={imageUrl}
            alt={entity.label}
            onError={() => setImgError(true)}
            className="h-36 w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[var(--color-surface-overlay)] to-transparent" />
        </div>
      )}

      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-0">
        Site Info
      </h3>
      <DetailValue label="Type" value={typeLabel} />
      <DetailValue label="Operator" value={entity.operator || 'Unknown'} />
      <DetailValue label="OSM ID" value={String(entity.osmId)} />
      <DetailValue
        label="Status"
        value={attack.isAttacked ? `Attacked (${attack.attackCount})` : 'Healthy'}
      />

      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Location
      </h3>
      <DetailValue label="Latitude" value={entity.lat.toFixed(6)} />
      <DetailValue label="Longitude" value={entity.lng.toFixed(6)} />
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          Map
        </span>
        <a
          href={osmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline"
        >
          View on OpenStreetMap
        </a>
      </div>

      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Source
      </h3>
      <DetailValue label="Data Source" value="Overpass API" />

      {attack.isAttacked && (
        <>
          <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
            Attack History
          </h3>
          <div className="px-3 py-1">
            <span className="text-xs text-text-secondary">
              {attack.attackCount} conflict event{attack.attackCount !== 1 ? 's' : ''} within 2km
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {visibleAttacks.map((evt) => {
              const date = new Date(evt.timestamp).toISOString().slice(0, 10);
              const evtLabel = EVENT_TYPE_LABELS[evt.type] ?? evt.type;
              return (
                <button
                  key={evt.id}
                  onClick={() => {
                    const currentView = getCurrentPanelView();
                    if (currentView) {
                      useUIStore.getState().pushView(currentView);
                    }
                    selectEntity(evt.id);
                    openDetailPanel();
                  }}
                  className="flex items-center justify-between px-3 py-1 text-xs hover:bg-white/5 rounded transition-colors text-left"
                >
                  <span className="text-text-secondary">{date}</span>
                  <span className="text-text-primary">{evtLabel}</span>
                  {evt.data.actor1 && (
                    <span className="text-text-muted truncate max-w-[100px]">{evt.data.actor1}</span>
                  )}
                </button>
              );
            })}
          </div>
          {attack.attackCount > MAX_VISIBLE_ATTACKS && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="px-3 py-1 text-[10px] text-accent hover:underline"
            >
              Show all ({attack.attackCount})
            </button>
          )}
        </>
      )}
    </div>
  );
}
