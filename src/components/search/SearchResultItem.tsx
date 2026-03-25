import type { MapEntity, SiteEntity } from '@/types/entities';
import { ENTITY_DOT_COLORS } from '@/components/map/layers/constants';
import { EVENT_TYPE_LABELS } from '@/types/ui';

interface SearchResultItemProps {
  entity: MapEntity | SiteEntity;
  matchField: string;
  matchValue: string;
  onSelect: (entity: MapEntity | SiteEntity) => void;
}

function getEntityColor(entity: MapEntity | SiteEntity): string {
  if (entity.type === 'flight') return ENTITY_DOT_COLORS.flights;
  if (entity.type === 'ship') return ENTITY_DOT_COLORS.ships;
  if (entity.type === 'site') return ENTITY_DOT_COLORS.siteHealthy;
  if (entity.type === 'airstrike') return ENTITY_DOT_COLORS.airstrikes;
  if (entity.type === 'assassination' || entity.type === 'abduction') return ENTITY_DOT_COLORS.targeted;
  return ENTITY_DOT_COLORS.groundCombat;
}

function getEntityTypeBadge(entity: MapEntity | SiteEntity): string {
  if (entity.type === 'flight') return 'Flight';
  if (entity.type === 'ship') return 'Ship';
  if (entity.type === 'site') return 'Site';
  return EVENT_TYPE_LABELS[entity.type] ?? entity.type;
}

export function SearchResultItem({ entity, matchField, matchValue, onSelect }: SearchResultItemProps) {
  const color = getEntityColor(entity);
  const badge = getEntityTypeBadge(entity);

  return (
    <button
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-elevated"
      onClick={() => onSelect(entity)}
    >
      {/* Color dot */}
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />

      {/* Label + match info */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-primary">
          {entity.label}
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
