import { useRef, useEffect } from 'react';
import type { AutocompleteSuggestion } from '@/hooks/useAutocomplete';

interface AutocompleteDropdownProps {
  suggestions: AutocompleteSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: AutocompleteSuggestion) => void;
  onHover?: (index: number) => void;
}

/**
 * Dropdown showing autocomplete suggestions below the search input.
 * Supports two modes: prefix suggestions (Stage 1) and value suggestions (Stage 2).
 */
export function AutocompleteDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  onHover,
}: AutocompleteDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (suggestions.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute left-0 right-0 top-full z-10 mt-1 max-h-[200px] overflow-y-auto rounded-lg border border-border bg-surface-elevated shadow-lg"
      data-testid="autocomplete-dropdown"
      role="listbox"
    >
      {suggestions.map((suggestion, i) => (
        <button
          key={suggestion.type === 'prefix' ? suggestion.prefix : `${suggestion.prefix}:${suggestion.value}`}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            i === selectedIndex ? 'bg-surface' : 'hover:bg-surface'
          }`}
          onMouseEnter={() => onHover?.(i)}
          onClick={() => onSelect(suggestion)}
          role="option"
          aria-selected={i === selectedIndex}
          type="button"
        >
          {suggestion.type === 'prefix' ? (
            <>
              <span className="font-medium text-text-primary">{suggestion.prefix}:</span>
              <span className="flex-1 truncate text-text-muted">{suggestion.description}</span>
              <kbd className="shrink-0 rounded bg-surface px-1 text-[10px] text-text-muted">Tab</kbd>
            </>
          ) : (
            <>
              <span className="text-text-primary">{suggestion.value}</span>
              {suggestion.count > 0 && (
                <span className="rounded-full bg-surface px-1.5 text-[10px] text-text-muted">
                  {suggestion.count}
                </span>
              )}
            </>
          )}
        </button>
      ))}
    </div>
  );
}
