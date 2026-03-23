import { useEffect, useRef } from 'react';
import { TAG_REGISTRY } from '@/lib/tagRegistry';

interface CheatSheetProps {
  onClose: () => void;
}

/** Group tags by their entity type categories */
const TAG_GROUPS = [
  {
    label: 'Cross-entity',
    prefixes: ['type', 'country', 'near', 'since', 'before', 'has'],
  },
  {
    label: 'Flight',
    prefixes: ['callsign', 'icao', 'altitude', 'speed', 'ground', 'heading', 'unidentified'],
  },
  {
    label: 'Ship',
    prefixes: ['mmsi', 'shipname'],
  },
  {
    label: 'Event',
    prefixes: ['actor', 'location', 'severity', 'cameo', 'mentions', 'date'],
  },
  {
    label: 'Site',
    prefixes: ['site', 'status'],
  },
] as const;

/**
 * Popover showing all available tag prefixes with descriptions and examples.
 * Triggered by clicking the ? icon in the search input area.
 */
export function CheatSheet({ onClose }: CheatSheetProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay listener to avoid immediate close from the trigger click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[400px] overflow-y-auto rounded-xl border border-border bg-surface-elevated p-4 shadow-2xl"
      data-testid="cheat-sheet"
    >
      <div className="mb-3 text-xs font-semibold text-text-primary">Tag Reference</div>
      {TAG_GROUPS.map((group) => (
        <div key={group.label} className="mb-3">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
            {group.label}
          </div>
          <div className="space-y-1">
            {group.prefixes.map((prefix) => {
              const tag = TAG_REGISTRY[prefix];
              if (!tag) return null;
              return (
                <div key={prefix} className="flex items-baseline gap-2 text-xs">
                  <code className={`shrink-0 font-medium ${tag.color}`}>{tag.prefix}:</code>
                  <span className="flex-1 text-text-muted">{tag.description}</span>
                  <span className="shrink-0 text-[10px] text-text-muted/50">
                    {tag.examples[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
