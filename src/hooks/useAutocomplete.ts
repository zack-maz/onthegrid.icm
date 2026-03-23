import { useMemo, useState, useEffect, useRef } from 'react';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSiteStore } from '@/stores/siteStore';
import { ALL_PREFIXES, TAG_REGISTRY, getTagValues } from '@/lib/tagRegistry';
import type { EntityDataSources, TagValue } from '@/lib/tagRegistry';

// --- Types ---

export interface PrefixSuggestion {
  type: 'prefix';
  prefix: string;
  label: string;
  description: string;
}

export interface ValueSuggestion {
  type: 'value';
  prefix: string;
  value: string;
  count: number;
}

export type AutocompleteSuggestion = PrefixSuggestion | ValueSuggestion;

// --- Word-at-cursor extraction ---

function getWordAtCursor(
  query: string,
  cursorPos: number,
): { word: string; start: number; end: number } {
  // Find word boundaries around cursor
  let start = cursorPos;
  let end = cursorPos;

  // Walk backward to find word start (stop at whitespace or parens)
  while (start > 0 && query[start - 1] !== ' ' && query[start - 1] !== '\t' && query[start - 1] !== '(' && query[start - 1] !== ')') {
    start--;
  }

  // Walk forward to find word end
  while (end < query.length && query[end] !== ' ' && query[end] !== '\t' && query[end] !== '(' && query[end] !== ')') {
    end++;
  }

  return { word: query.slice(start, end), start, end };
}

// --- Hook ---

const DEBOUNCE_MS = 100;

/**
 * Computes autocomplete suggestions based on cursor position in the query.
 *
 * Two stages:
 * - Stage 1 (prefix): User is typing a word that partially matches a tag prefix
 * - Stage 2 (value): User has typed "prefix:" and is entering a value
 *
 * Uses useMemo with entity arrays as deps so value lists update with data, not per keystroke.
 */
export function useAutocomplete(
  query: string,
  cursorPosition: number,
): AutocompleteSuggestion[] {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [debouncedCursor, setDebouncedCursor] = useState(cursorPosition);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce query + cursor changes
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setDebouncedCursor(cursorPosition);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [query, cursorPosition]);

  // Pre-compute entity data sources (updates when data changes, not per keystroke)
  const flights = useFlightStore((s) => s.flights);
  const ships = useShipStore((s) => s.ships);
  const events = useEventStore((s) => s.events);
  const sites = useSiteStore((s) => s.sites);

  const entityData: EntityDataSources = useMemo(
    () => ({ flights, ships, events, sites }),
    [flights, ships, events, sites],
  );

  // Compute suggestions
  return useMemo(() => {
    if (!debouncedQuery.trim()) return [];

    const { word } = getWordAtCursor(debouncedQuery, debouncedCursor);
    if (!word) return [];

    // Skip keywords
    if (word === 'OR') return [];

    const cleanWord = word;
    if (!cleanWord) return [];

    const colonIdx = cleanWord.indexOf(':');

    if (colonIdx >= 0 && colonIdx < cleanWord.length - 1) {
      // Stage 2: prefix:partialValue -- suggest matching values
      const prefix = cleanWord.slice(0, colonIdx);
      const partial = cleanWord.slice(colonIdx + 1).toLowerCase();
      const tagDef = TAG_REGISTRY[prefix];
      if (!tagDef) return [];

      const allValues: TagValue[] = getTagValues(prefix, entityData);
      if (allValues.length === 0) return [];

      return allValues
        .filter((v) => v.value.toLowerCase().includes(partial))
        .slice(0, 8)
        .map((v): ValueSuggestion => ({
          type: 'value',
          prefix,
          value: v.value,
          count: v.count,
        }));
    }

    if (colonIdx === cleanWord.length - 1) {
      // User typed "prefix:" with nothing after -- show all values for this prefix
      const prefix = cleanWord.slice(0, colonIdx);
      const tagDef = TAG_REGISTRY[prefix];
      if (!tagDef) return [];

      const allValues = getTagValues(prefix, entityData);
      return allValues.slice(0, 8).map((v): ValueSuggestion => ({
        type: 'value',
        prefix,
        value: v.value,
        count: v.count,
      }));
    }

    // Stage 1: partial prefix match -- suggest matching prefixes
    const partial = cleanWord.toLowerCase();
    return ALL_PREFIXES
      .filter((p) => p.startsWith(partial) && p !== partial)
      .slice(0, 6)
      .map((p): PrefixSuggestion => ({
        type: 'prefix',
        prefix: p,
        label: TAG_REGISTRY[p].label,
        description: TAG_REGISTRY[p].description,
      }));
  }, [debouncedQuery, debouncedCursor, entityData]);
}
