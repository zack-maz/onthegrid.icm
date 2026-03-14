import { useUIStore } from '@/stores/uiStore';
import { OverlayPanel } from '@/components/ui/OverlayPanel';

export function FiltersSlot() {
  const isExpanded = useUIStore((s) => s.isFiltersExpanded);
  const toggleFilters = useUIStore((s) => s.toggleFilters);

  return (
    <div data-testid="filters-slot">
      <OverlayPanel>
        <button
          onClick={toggleFilters}
          className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          <span>Filters</span>
          <span className="text-text-muted">{isExpanded ? '-' : '+'}</span>
        </button>
        {isExpanded && (
          <div className="mt-2 space-y-1">
            <p className="text-sm text-text-muted">No filters configured</p>
          </div>
        )}
      </OverlayPanel>
    </div>
  );
}
