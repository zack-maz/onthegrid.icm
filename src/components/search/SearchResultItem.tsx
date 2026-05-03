import { ENTITY_DOT_COLORS } from '@/components/map/layers/constants';
import { getWaterFacilityDisplayName } from '@/lib/waterLabel';
import type { MapEntity, SiteEntity } from '@/types/entities';
import { EVENT_TYPE_LABELS } from '@/types/ui';

import type { WaterFacility } from '../../../server/types';

type SearchableEntity = MapEntity | SiteEntity | WaterFacility;

interface SearchResultItemProps {
  entity: SearchableEntity;
  matchField: string;
  matchValue: string;
  onSelect: (entity: SearchableEntity) => void;
}

function getEntityColor(entity: SearchableEntity): string {
  if (entity.type === 'flight') return ENTITY_DOT_COLORS.flights;
  if (entity.type === 'ship') return ENTITY_DOT_COLORS.ships;
  if (entity.type === 'site') return ENTITY_DOT_COLORS.siteHealthy;
  if (entity.type === 'water') return '#4ade80';
  if (entity.type === 'airstrike') return ENTITY_DOT_COLORS.airstrikes;
  if (entity.type === 'on_ground') return ENTITY_DOT_COLORS.on_ground;
  if (entity.type === 'explosion') return ENTITY_DOT_COLORS.explosion;
  if (entity.type === 'targeted') return ENTITY_DOT_COLORS.targeted;
  return ENTITY_DOT_COLORS.other; // 'other'
}

function getEntityTypeBadge(entity: SearchableEntity): string {
  if (entity.type === 'flight') return 'Flight';
  if (entity.type === 'ship') return 'Ship';
  if (entity.type === 'site') return 'Site';
  if (entity.type === 'water') return 'Water';
  return EVENT_TYPE_LABELS[entity.type] ?? entity.type;
}

export function SearchResultItem({
  entity,
  matchField,
  matchValue,
  onSelect,
}: SearchResultItemProps) {
  const color = getEntityColor(entity);
  const badge = getEntityTypeBadge(entity);

  return (
    <button
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-elevated"
      onClick={() => onSelect(entity)}
    >
      {/* Color dot */}
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />

      {/* Label + match info */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-primary">
          {entity.type === 'water'
            ? getWaterFacilityDisplayName(entity as WaterFacility)
            : entity.label}
        </div>
        {matchField !== 'name' && matchField !== 'callsign' && matchField !== 'label' && (
          <div className="truncate text-xs text-text-secondary">
            {matchField}: {matchValue}
          </div>
        )}
      </div>

      {/* Type badge */}
      <span className="shrink-0 rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-text-secondary">
        {badge}
      </span>
    </button>
  );
}
