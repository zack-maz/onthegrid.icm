import { useEffect, useRef } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import { parse, type QueryNode } from '@/lib/queryParser';
import { serialize } from '@/lib/querySerializer';
import { parseTemporalValue } from '@/lib/queryEvaluator';
import { CONFLICT_TOGGLE_GROUPS } from '@/types/ui';

// ─── Sync Maps ───────────────────────────────────────────────

/** type: tag value -> uiStore toggle key */
export const TYPE_TOGGLE_MAP: Record<string, string> = {
  // Primary types
  flight: 'showFlights',
  ship: 'showShips',
  // showAirstrikes group
  airstrike: 'showAirstrikes',
  // showGroundCombat group (all 8 types from CONFLICT_TOGGLE_GROUPS.showGroundCombat)
  ground_combat: 'showGroundCombat',
  shelling: 'showGroundCombat',
  bombing: 'showGroundCombat',
  assault: 'showGroundCombat',
  blockade: 'showGroundCombat',
  ceasefire_violation: 'showGroundCombat',
  mass_violence: 'showGroundCombat',
  wmd: 'showGroundCombat',
  // showTargeted group
  assassination: 'showTargeted',
  abduction: 'showTargeted',
};

/** Reverse map: toggle key -> all type values it controls */
export const TOGGLE_TYPE_MAP: Record<string, string[]> = {
  showFlights: ['flight'],
  showShips: ['ship'],
  showAirstrikes: ['airstrike'],
  showGroundCombat: [
    'ground_combat',
    'shelling',
    'bombing',
    'assault',
    'blockade',
    'ceasefire_violation',
    'mass_violence',
    'wmd',
  ],
  showTargeted: ['assassination', 'abduction'],
};

/** site: tag value -> uiStore toggle key */
export const SITE_TOGGLE_MAP: Record<string, string> = {
  nuclear: 'showNuclear',
  naval: 'showNaval',
  oil: 'showOil',
  airbase: 'showAirbase',
  desalination: 'showDesalination',
  port: 'showPort',
};

/** All conflict event type values (for showEvents parent toggle detection) */
const CONFLICT_EVENT_TYPES = new Set<string>(
  Object.values(CONFLICT_TOGGLE_GROUPS).flat(),
);

// ─── AST Helpers ─────────────────────────────────────────────

/** Extract all tag nodes from an AST, walking the tree */
export function extractTags(node: QueryNode | null): Array<{ prefix: string; value: string; negated: boolean }> {
  if (!node) return [];
  switch (node.type) {
    case 'tag':
      return [{ prefix: node.prefix, value: node.value, negated: node.negated }];
    case 'text':
      return [];
    case 'not':
      return extractTags(node.child);
    case 'and':
    case 'or':
      return [...extractTags(node.left), ...extractTags(node.right)];
  }
}

/** Extract non-synced nodes from AST (tags whose prefixes don't map to toggles) */
function extractNonSyncedNodes(node: QueryNode | null): QueryNode[] {
  if (!node) return [];
  switch (node.type) {
    case 'tag': {
      const p = node.prefix.toLowerCase();
      if (p === 'type' && node.value.toLowerCase() in TYPE_TOGGLE_MAP) return [];
      if (p === 'site' && node.value.toLowerCase() in SITE_TOGGLE_MAP) return [];
      if (p === 'country' || p === 'since' || p === 'before') return [];
      // Non-synced tag (callsign, actor, near, etc.)
      return [node];
    }
    case 'text':
      return [node];
    case 'not':
      return extractNonSyncedNodes(node.child).length > 0 ? [node] : [];
    case 'and':
    case 'or':
      return [...extractNonSyncedNodes(node.left), ...extractNonSyncedNodes(node.right)];
  }
}

/** Build an AND chain from an array of nodes */
function buildAndChain(nodes: QueryNode[]): QueryNode | null {
  if (nodes.length === 0) return null;
  let result = nodes[0];
  for (let i = 1; i < nodes.length; i++) {
    result = { type: 'and', left: result, right: nodes[i] };
  }
  return result;
}

// ─── Sync Logic (pure functions for testability) ─────────────

/**
 * Search -> Sidebar: Extract toggle state from AST.
 * Returns a partial state update for uiStore.
 */
export function deriveTogglesFromAST(
  node: QueryNode | null,
): Record<string, boolean> {
  const tags = extractTags(node);
  const typeTags = tags
    .filter((t) => t.prefix.toLowerCase() === 'type' && !t.negated)
    .map((t) => t.value.toLowerCase());
  const siteTags = tags
    .filter((t) => t.prefix.toLowerCase() === 'site' && !t.negated)
    .map((t) => t.value.toLowerCase());

  const updates: Record<string, boolean> = {};

  // If no type: tags in query, don't alter toggles (query might be text-only)
  if (typeTags.length === 0 && siteTags.length === 0) return updates;

  // Determine which toggles to activate from type: tags
  const activeToggleKeys = new Set<string>();
  for (const tv of typeTags) {
    const toggleKey = TYPE_TOGGLE_MAP[tv];
    if (toggleKey) activeToggleKeys.add(toggleKey);
  }

  // Set toggle state for each mapped toggle
  for (const toggleKey of Object.keys(TOGGLE_TYPE_MAP)) {
    updates[toggleKey] = activeToggleKeys.has(toggleKey);
  }

  // showEvents parent: ON if any conflict event type tag present
  const hasConflictTag = typeTags.some((tv) => CONFLICT_EVENT_TYPES.has(tv));
  updates['showEvents'] = hasConflictTag;

  // Site toggles
  const activeSiteToggles = new Set<string>();
  for (const sv of siteTags) {
    const toggleKey = SITE_TOGGLE_MAP[sv];
    if (toggleKey) activeSiteToggles.add(toggleKey);
  }

  if (siteTags.length > 0) {
    for (const toggleKey of Object.values(SITE_TOGGLE_MAP)) {
      updates[toggleKey] = activeSiteToggles.has(toggleKey);
    }
    updates['showSites'] = siteTags.length > 0;
  }

  return updates;
}

/**
 * Search -> FilterStore: Extract date/country filters from AST.
 */
export function deriveFiltersFromAST(
  node: QueryNode | null,
  now: number,
): { dateStart?: number | null; dateEnd?: number | null; countries?: string[] } {
  const tags = extractTags(node);
  const result: { dateStart?: number | null; dateEnd?: number | null; countries?: string[] } = {};

  const sinceTags = tags.filter((t) => t.prefix.toLowerCase() === 'since' && !t.negated);
  const beforeTags = tags.filter((t) => t.prefix.toLowerCase() === 'before' && !t.negated);
  const countryTags = tags.filter((t) => t.prefix.toLowerCase() === 'country' && !t.negated);

  if (sinceTags.length > 0) {
    result.dateStart = parseTemporalValue(sinceTags[0].value, now);
  }
  if (beforeTags.length > 0) {
    result.dateEnd = parseTemporalValue(beforeTags[0].value, now);
  }
  if (countryTags.length > 0) {
    result.countries = countryTags.map((t) => t.value);
  }

  return result;
}

/**
 * Sidebar -> Search: Build AST from toggle state + existing non-synced tags.
 */
export function buildASTFromToggles(
  toggles: Record<string, boolean>,
  existingAST: QueryNode | null,
): QueryNode | null {
  const nodes: QueryNode[] = [];

  // Add type: tags for ON toggles
  for (const [toggleKey, typeValues] of Object.entries(TOGGLE_TYPE_MAP)) {
    if (toggles[toggleKey]) {
      // Add first type value only (e.g., for showGroundCombat add 'ground_combat')
      // Otherwise the query would be very long
      nodes.push({
        type: 'tag',
        prefix: 'type',
        value: typeValues[0],
        negated: false,
      });
    }
  }

  // Add site: tags for ON site toggles
  for (const [siteType, toggleKey] of Object.entries(SITE_TOGGLE_MAP)) {
    if (toggles[toggleKey]) {
      nodes.push({
        type: 'tag',
        prefix: 'site',
        value: siteType,
        negated: false,
      });
    }
  }

  // Preserve non-synced tags from existing AST
  const nonSynced = extractNonSyncedNodes(existingAST);
  nodes.push(...nonSynced);

  return buildAndChain(nodes);
}

// ─── Hook ────────────────────────────────────────────────────

/**
 * Bidirectional sync between search bar AST and sidebar toggles/filters.
 * Uses a syncSource ref to prevent infinite loops.
 * Mount in AppShell alongside other hooks.
 */
export function useQuerySync(): void {
  const syncSourceRef = useRef<'search' | 'sidebar' | null>(null);

  // Subscribe to parsedQuery changes
  const parsedQuery = useSearchStore((s) => s.parsedQuery);

  // Subscribe to relevant toggle state
  const showFlights = useUIStore((s) => s.showFlights);
  const showShips = useUIStore((s) => s.showShips);
  const showEvents = useUIStore((s) => s.showEvents);
  const showAirstrikes = useUIStore((s) => s.showAirstrikes);
  const showGroundCombat = useUIStore((s) => s.showGroundCombat);
  const showTargeted = useUIStore((s) => s.showTargeted);
  const showSites = useUIStore((s) => s.showSites);
  const showNuclear = useUIStore((s) => s.showNuclear);
  const showNaval = useUIStore((s) => s.showNaval);
  const showOil = useUIStore((s) => s.showOil);
  const showAirbase = useUIStore((s) => s.showAirbase);
  const showDesalination = useUIStore((s) => s.showDesalination);
  const showPort = useUIStore((s) => s.showPort);

  // Track previous query to detect search-initiated changes
  const prevQueryRef = useRef<string>('');

  // Search -> Sidebar sync
  useEffect(() => {
    if (syncSourceRef.current === 'sidebar') {
      syncSourceRef.current = null;
      return;
    }

    const currentQuery = useSearchStore.getState().query;
    if (currentQuery === prevQueryRef.current) return;
    prevQueryRef.current = currentQuery;

    if (!parsedQuery) return;

    const toggleUpdates = deriveTogglesFromAST(parsedQuery);
    if (Object.keys(toggleUpdates).length > 0) {
      syncSourceRef.current = 'search';
      useUIStore.setState(toggleUpdates);
    }

    const filterUpdates = deriveFiltersFromAST(parsedQuery, Date.now());
    if (filterUpdates.dateStart !== undefined) {
      useFilterStore.getState().setDateRange(
        filterUpdates.dateStart,
        useFilterStore.getState().dateEnd,
      );
    }
    if (filterUpdates.dateEnd !== undefined) {
      useFilterStore.getState().setDateRange(
        useFilterStore.getState().dateStart,
        filterUpdates.dateEnd,
      );
    }
    if (filterUpdates.countries !== undefined) {
      useFilterStore.getState().setFlightCountries(filterUpdates.countries);
    }

    // Clear syncSource after a microtask to allow effects to settle
    Promise.resolve().then(() => {
      if (syncSourceRef.current === 'search') {
        syncSourceRef.current = null;
      }
    });
  }, [parsedQuery]);

  // Build current toggle state object for sidebar -> search sync
  const toggleState = {
    showFlights,
    showShips,
    showAirstrikes,
    showGroundCombat,
    showTargeted,
    showNuclear,
    showNaval,
    showOil,
    showAirbase,
    showDesalination,
    showPort,
  };

  // Sidebar -> Search sync
  const prevTogglesRef = useRef(toggleState);

  useEffect(() => {
    if (syncSourceRef.current === 'search') {
      syncSourceRef.current = null;
      prevTogglesRef.current = toggleState;
      return;
    }

    // Check if toggles actually changed
    const prev = prevTogglesRef.current;
    const changed = Object.keys(toggleState).some(
      (key) => (toggleState as any)[key] !== (prev as any)[key],
    );

    if (!changed) return;

    prevTogglesRef.current = toggleState;

    // Only sync if there's an existing query (don't generate query from defaults)
    const currentQuery = useSearchStore.getState().query;
    if (!currentQuery.trim()) return;

    syncSourceRef.current = 'sidebar';
    const currentAST = useSearchStore.getState().parsedQuery;
    const newAST = buildASTFromToggles(toggleState, currentAST);
    useSearchStore.getState().setParsedQuery(newAST);
    prevQueryRef.current = useSearchStore.getState().query;

    // Clear syncSource after a microtask
    Promise.resolve().then(() => {
      if (syncSourceRef.current === 'sidebar') {
        syncSourceRef.current = null;
      }
    });
  }, [
    showFlights,
    showShips,
    showEvents,
    showAirstrikes,
    showGroundCombat,
    showTargeted,
    showSites,
    showNuclear,
    showNaval,
    showOil,
    showAirbase,
    showDesalination,
    showPort,
  ]);
}
