import { useEffect, useRef, useCallback, useState } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useUIStore } from '@/stores/uiStore';
import { useSearchResults } from '@/hooks/useSearchResults';
import { useAutocomplete, type AutocompleteSuggestion } from '@/hooks/useAutocomplete';
import { SearchResultGroup } from '@/components/search/SearchResultGroup';
import { TagChipRow } from '@/components/search/TagChipRow';
import { SyntaxOverlay } from '@/components/search/SyntaxOverlay';
import { AutocompleteDropdown } from '@/components/search/AutocompleteDropdown';
import { CheatSheet } from '@/components/search/CheatSheet';
import type { MapEntity, SiteEntity } from '@/types/entities';

// --- Word-at-cursor extraction (for autocomplete acceptance) ---

function getWordBounds(
  query: string,
  cursorPos: number,
): { start: number; end: number } {
  let start = cursorPos;
  let end = cursorPos;
  while (start > 0 && query[start - 1] !== ' ' && query[start - 1] !== '\t' && query[start - 1] !== '(' && query[start - 1] !== ')') {
    start--;
  }
  while (end < query.length && query[end] !== ' ' && query[end] !== '\t' && query[end] !== '(' && query[end] !== ')') {
    end++;
  }
  return { start, end };
}

/**
 * Spotlight-style search modal opened via Cmd+K.
 * Renders conditionally when searchStore.isSearchModalOpen is true.
 * Includes the global Cmd+K listener (always mounted).
 *
 * Integrates: TagChipRow, SyntaxOverlay, AutocompleteDropdown, CheatSheet
 */
export function SearchModal() {
  const isOpen = useSearchStore((s) => s.isSearchModalOpen);
  const query = useSearchStore((s) => s.query);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useSearchResults();

  // Cursor and autocomplete state
  const [cursorPos, setCursorPos] = useState(0);
  const [acIndex, setAcIndex] = useState(0);
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const suggestions = useAutocomplete(query, cursorPos);

  // Reset autocomplete index when suggestions change
  useEffect(() => {
    setAcIndex(0);
  }, [suggestions.length]);

  // Close cheat sheet when modal closes
  useEffect(() => {
    if (!isOpen) setShowCheatSheet(false);
  }, [isOpen]);

  // Global Cmd+K shortcut (always active)
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        useSearchStore.getState().openSearchModal();
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Autofocus input on open
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // --- Cursor tracking ---
  const trackCursor = useCallback(() => {
    const pos = inputRef.current?.selectionStart ?? 0;
    setCursorPos(pos);
  }, []);

  // --- Autocomplete acceptance ---
  const acceptSuggestion = useCallback(
    (suggestion: AutocompleteSuggestion) => {
      const currentQuery = useSearchStore.getState().query;
      const pos = inputRef.current?.selectionStart ?? cursorPos;
      const { start, end } = getWordBounds(currentQuery, pos);
      const word = currentQuery.slice(start, end);

      let replacement: string;
      if (suggestion.type === 'prefix') {
        // Replace partial word with prefix:
        replacement = suggestion.prefix + ':';
      } else {
        // Replace prefix:partial with prefix:value
        const colonIdx = word.indexOf(':');
        const prefix = colonIdx >= 0 ? word.slice(0, colonIdx) : suggestion.prefix;
        // Quote values with spaces
        const val = suggestion.value.includes(' ') ? `"${suggestion.value}"` : suggestion.value;
        replacement = `${prefix}:${val}`;
      }

      const newQuery = currentQuery.slice(0, start) + replacement + currentQuery.slice(end);
      const newCursorPos = start + replacement.length;

      useSearchStore.getState().setQuery(newQuery);

      // Restore cursor position after React render
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          inputRef.current.focus();
        }
      });
    },
    [cursorPos],
  );

  // --- Tag chip insertion ---
  const handleInsertTag = useCallback((tag: string) => {
    const currentQuery = useSearchStore.getState().query;
    const newQuery = currentQuery ? `${currentQuery} ${tag}` : tag;
    useSearchStore.getState().setQuery(newQuery);

    requestAnimationFrame(() => {
      if (inputRef.current) {
        const pos = newQuery.length;
        inputRef.current.setSelectionRange(pos, pos);
        inputRef.current.focus();
      }
    });
  }, []);

  // --- Entity selection ---
  const handleSelect = useCallback((entity: MapEntity | SiteEntity) => {
    useNotificationStore.getState().setFlyToTarget({
      lng: entity.lng,
      lat: entity.lat,
      zoom: 10,
    });
    useUIStore.getState().selectEntity(entity.id);
    useUIStore.getState().openDetailPanel();
    useSearchStore.getState().closeSearchModal();
  }, []);

  // --- Keyboard navigation ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Close cheat sheet first, then autocomplete, then modal
      if (e.key === 'Escape') {
        if (showCheatSheet) {
          setShowCheatSheet(false);
          e.stopPropagation();
          return;
        }
        if (suggestions.length > 0) {
          // Clear suggestions by moving cursor to reset state
          // (handled by centralized escape handler at modal level)
          return;
        }
        // Escape for modal close handled by centralized useEscapeKeyHandler
        return;
      }

      // Autocomplete navigation
      if (suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setAcIndex((prev) => (prev + 1) % suggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setAcIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          acceptSuggestion(suggestions[acIndex]);
          return;
        }
      }

      // Enter: run search (never accept suggestion)
      if (e.key === 'Enter') {
        const q = useSearchStore.getState().query.trim();
        if (q) {
          const ids = new Set<string>();
          for (const r of results.flights) ids.add(r.entity.id);
          for (const r of results.ships) ids.add(r.entity.id);
          for (const r of results.events) ids.add(r.entity.id);
          for (const r of results.sites) ids.add(r.entity.id);
          useSearchStore.getState().setMatchedIds(ids);
          useSearchStore.getState().applyAsFilter();
        }
      }
    },
    [suggestions, acIndex, results, showCheatSheet, acceptSuggestion],
  );

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      useSearchStore.getState().closeSearchModal();
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div
      data-testid="search-modal"
      className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center bg-black/50 pt-[20vh]"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface-elevated shadow-2xl">
        {/* Tag chip row */}
        <TagChipRow onInsertTag={handleInsertTag} />

        {/* Search input with syntax overlay */}
        <div className="relative border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0 text-text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>

            {/* Input container with overlay */}
            <div className="relative flex-1">
              {/* Syntax overlay (behind) */}
              <SyntaxOverlay
                query={query}
                className="absolute inset-0 text-lg leading-normal"
              />
              {/* Transparent input (on top, caret visible) */}
              <input
                ref={inputRef}
                data-testid="search-input"
                type="text"
                placeholder="Search flights, ships, events, sites..."
                value={query}
                onChange={(e) => {
                  useSearchStore.getState().setQuery(e.target.value);
                  trackCursor();
                }}
                onSelect={trackCursor}
                onKeyUp={trackCursor}
                onClick={trackCursor}
                className="relative z-[1] w-full bg-transparent text-lg text-transparent caret-white placeholder:text-text-muted outline-none"
              />
            </div>

            {/* ? help icon */}
            <button
              className="rounded p-1 text-text-muted transition-colors hover:text-text-primary"
              onClick={() => setShowCheatSheet((prev) => !prev)}
              aria-label="Tag reference"
              type="button"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>

            {/* Clear button */}
            {query && (
              <button
                className="rounded p-1 text-text-muted transition-colors hover:text-text-primary"
                onClick={() => useSearchStore.getState().setQuery('')}
                aria-label="Clear search"
                type="button"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          <AutocompleteDropdown
            suggestions={suggestions}
            selectedIndex={acIndex}
            onSelect={acceptSuggestion}
          />

          {/* Cheat sheet popover */}
          {showCheatSheet && (
            <CheatSheet onClose={() => setShowCheatSheet(false)} />
          )}
        </div>

        {/* Results area */}
        {query.trim() && (
          <div className="max-h-[400px] overflow-y-auto">
            {results.totalCount === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-muted">
                No results found
              </div>
            ) : (
              <>
                <SearchResultGroup
                  type="Flights"
                  results={results.flights}
                  onSelect={handleSelect}
                />
                <SearchResultGroup
                  type="Ships"
                  results={results.ships}
                  onSelect={handleSelect}
                />
                <SearchResultGroup
                  type="Events"
                  results={results.events}
                  onSelect={handleSelect}
                />
                <SearchResultGroup
                  type="Sites"
                  results={results.sites}
                  onSelect={handleSelect}
                />
              </>
            )}

            {/* Footer hint */}
            {results.totalCount > 0 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-2">
                <span className="text-[10px] text-text-muted">
                  {results.totalCount} result{results.totalCount !== 1 ? 's' : ''}
                </span>
                <span className="text-[10px] text-text-muted">
                  Press <kbd className="rounded bg-surface px-1 font-medium">Enter</kbd> to filter
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
