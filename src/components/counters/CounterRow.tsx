import { useEffect, useRef, useState } from 'react';

import { EntityListItem } from './EntityListItem';

import type { CounterEntity } from './useCounterData';

interface CounterRowProps {
  label: string;
  value: number;
  color?: string;
  // Dropdown props
  entities?: CounterEntity[];
  isExpanded?: boolean;
  onToggle?: () => void;
  onEntityClick?: (entity: CounterEntity) => void;
  selectedEntityId?: string | null;
}

const fmt = new Intl.NumberFormat('en-US');
const ITEM_HEIGHT = 25;
const MAX_VISIBLE = 8;
const MAX_HEIGHT = MAX_VISIBLE * ITEM_HEIGHT;

export function CounterRow({
  label,
  value,
  color,
  entities,
  isExpanded,
  onToggle,
  onEntityClick,
  selectedEntityId,
}: CounterRowProps) {
  const prevRef = useRef<number>(value);
  const [delta, setDelta] = useState<number | null>(null);
  const [deltaKey, setDeltaKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rangeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prevRef.current !== value) {
      const diff = value - prevRef.current;
      setDelta(diff);
      setDeltaKey((k) => k + 1);
      prevRef.current = value;

      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setDelta(null);
        timeoutRef.current = null;
      }, 3000);
    }

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value]);

  const deltaText =
    delta !== null ? (delta > 0 ? `+${fmt.format(delta)}` : fmt.format(delta)) : null;

  const hasEntities = entities !== undefined;
  const isDisabled = hasEntities && value === 0;
  const showOverflowIndicator = hasEntities && (entities?.length ?? 0) > MAX_VISIBLE;

  const handleScroll = () => {
    if (!scrollRef.current || !rangeRef.current || !entities) return;
    const { scrollTop } = scrollRef.current;
    const firstVisible = Math.floor(scrollTop / ITEM_HEIGHT) + 1;
    const lastVisible = Math.min(firstVisible + MAX_VISIBLE - 1, entities.length);
    rangeRef.current.textContent = `Showing ${firstVisible}-${lastVisible} of ${entities.length}`;
  };

  const rowContent = (
    <>
      <div className="flex items-center gap-1.5 w-24 shrink-0">
        {color && (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="text-text-secondary">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-1 justify-end">
        <span className="tabular-nums text-text-primary">{fmt.format(value)}</span>
        {deltaText && (
          <span key={deltaKey} className="text-accent-green text-[10px] tabular-nums animate-delta">
            {deltaText}
          </span>
        )}
        {hasEntities && !isDisabled && (
          <svg
            viewBox="0 0 24 24"
            className={`h-3 w-3 text-text-muted transition-transform duration-150 shrink-0 ${
              isExpanded ? 'rotate-90' : ''
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </div>
    </>
  );

  return (
    <div>
      {hasEntities ? (
        <button
          className={`flex items-center gap-4 text-xs w-full text-left ${
            isDisabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'
          }`}
          onClick={onToggle}
          disabled={isDisabled}
          data-testid="counter-row-button"
        >
          {rowContent}
        </button>
      ) : (
        <div className="flex items-center gap-4 text-xs">{rowContent}</div>
      )}

      {/* Expandable dropdown */}
      {hasEntities && (
        <div
          className="overflow-hidden transition-[max-height] duration-150 ease-in-out"
          style={{ maxHeight: isExpanded ? MAX_HEIGHT : 0 }}
        >
          {isExpanded && (
            <>
              {entities!.length === 0 ? (
                <div className="text-xs text-text-muted italic text-center py-2">
                  No entities in view
                </div>
              ) : (
                <>
                  <div
                    ref={scrollRef}
                    className="overflow-y-auto"
                    style={{ maxHeight: MAX_HEIGHT }}
                    onScroll={handleScroll}
                  >
                    {entities!.map((entity) => (
                      <EntityListItem
                        key={entity.id}
                        entity={entity}
                        isSelected={entity.id === selectedEntityId}
                        onClick={onEntityClick ?? (() => {})}
                      />
                    ))}
                  </div>
                  {showOverflowIndicator && (
                    <div ref={rangeRef} className="text-[10px] text-text-muted text-center py-0.5">
                      {`Showing 1-${MAX_VISIBLE} of ${entities!.length}`}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
