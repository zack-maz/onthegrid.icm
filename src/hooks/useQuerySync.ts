import { useEffect, useRef } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import { parse, type QueryNode } from '@/lib/queryParser';
import { serialize } from '@/lib/querySerializer';
import { parseTemporalValue, parseRangeValue } from '@/lib/queryEvaluator';
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

/**
 * Boolean search tags that map to uiStore toggles.
 * All are fully bidirectional: search ↔ filter panel toggles.
 */
export const BOOL_TAG_MAP: Record<string, { toggle: string; trueValue: string }> = {
  ground: { toggle: 'showGroundTraffic', trueValue: 'true' },
  unidentified: { toggle: 'pulseEnabled', trueValue: 'true' },
  status: { toggle: 'showHitOnly', trueValue: 'attacked' },
};

/** Synced range tag prefixes → filterStore setter info */
const RANGE_TAG_PREFIXES = new Set(['altitude', 'speed']);

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

/** Extract non-synced nodes from AST (tags whose prefixes don't map to toggles/filters) */
function extractNonSyncedNodes(node: QueryNode | null): QueryNode[] {
  if (!node) return [];
  switch (node.type) {
    case 'tag': {
      const p = node.prefix.toLowerCase();
      const v = node.value.toLowerCase();
      if (p === 'type' && (v in TYPE_TOGGLE_MAP || v === '*')) return [];
      if (p === 'site' && (v in SITE_TOGGLE_MAP || v === '*')) return [];
      if (p === 'country' || p === 'since' || p === 'before') return [];
      // Boolean tags are synced (rebuilt from toggle state)
      if (p in BOOL_TAG_MAP) return [];
      // Range tags are synced (rebuilt from filter state)
      if (RANGE_TAG_PREFIXES.has(p)) return [];
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

// ─── Range helpers ──────────────────────────────────────────

/** Convert a range tag value to min/max pair */
export function rangeToMinMax(value: string): { min: number | null; max: number | null } {
  const parsed = parseRangeValue(value);
  if (!parsed) return { min: null, max: null };
  switch (parsed.op) {
    case 'eq': return { min: parsed.num, max: parsed.num };
    case 'gte': return { min: parsed.num, max: null };
    case 'gt': return { min: parsed.num, max: null };
    case 'lte': return { min: null, max: parsed.num };
    case 'lt': return { min: null, max: parsed.num };
    case 'range': return { min: parsed.num, max: parsed.num2 ?? null };
  }
}

/** Convert min/max pair to a range tag value string */
export function minMaxToRangeValue(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return `${min}-${max}`;
  if (min !== null) return `>=${min}`;
  if (max !== null) return `<=${max}`;
  return null;
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
  const negTypeTags = tags
    .filter((t) => t.prefix.toLowerCase() === 'type' && t.negated)
    .map((t) => t.value.toLowerCase());
  const negSiteTags = tags
    .filter((t) => t.prefix.toLowerCase() === 'site' && t.negated)
    .map((t) => t.value.toLowerCase());

  const updates: Record<string, boolean> = {};

  // ── Boolean tags (ground, unidentified, status) ──
  for (const [prefix, { toggle, trueValue }] of Object.entries(BOOL_TAG_MAP)) {
    const boolTags = tags.filter((t) => t.prefix.toLowerCase() === prefix && !t.negated);
    if (boolTags.length > 0) {
      const v = boolTags[0].value.toLowerCase();
      updates[toggle] = v === trueValue;
    }
  }

  // If no type: or site: tags in query, skip type/site toggle updates
  if (typeTags.length === 0 && siteTags.length === 0 &&
      negTypeTags.length === 0 && negSiteTags.length === 0) {
    return updates;
  }

  // Positive tags: turn ON mentioned toggles
  if (typeTags.length > 0) {
    for (const tv of typeTags) {
      const toggleKey = TYPE_TOGGLE_MAP[tv];
      if (toggleKey) updates[toggleKey] = true;
    }

    // showEvents parent: ON if any conflict event type tag present
    const hasConflictTag = typeTags.some((tv) => CONFLICT_EVENT_TYPES.has(tv));
    if (hasConflictTag) {
      updates['showEvents'] = true;
    }
  }

  if (siteTags.length > 0) {
    for (const sv of siteTags) {
      const toggleKey = SITE_TOGGLE_MAP[sv];
      if (toggleKey) updates[toggleKey] = true;
    }
    updates['showSites'] = true;
  }

  // Negated tags: turn OFF mentioned toggles
  // Wildcard (*) turns off everything. Specific negation (e.g. !site:nuclear)
  // means "show all EXCEPT these" — so turn everything ON first, then OFF the negated ones.
  if (negTypeTags.length > 0) {
    if (negTypeTags.includes('*')) {
      for (const toggleKey of Object.values(TYPE_TOGGLE_MAP)) {
        updates[toggleKey] = false;
      }
      updates['showEvents'] = false;
    } else {
      // "Show all except these" — enable all type toggles, then disable negated
      for (const toggleKey of new Set(Object.values(TYPE_TOGGLE_MAP))) {
        updates[toggleKey] = true;
      }
      updates['showEvents'] = true;
      for (const tv of negTypeTags) {
        const toggleKey = TYPE_TOGGLE_MAP[tv];
        if (toggleKey) updates[toggleKey] = false;
      }
    }
  }

  if (negSiteTags.length > 0) {
    if (negSiteTags.includes('*')) {
      for (const toggleKey of Object.values(SITE_TOGGLE_MAP)) {
        updates[toggleKey] = false;
      }
      updates['showSites'] = false;
    } else {
      // "Show all except these" — enable all site toggles, then disable negated
      updates['showSites'] = true;
      for (const toggleKey of Object.values(SITE_TOGGLE_MAP)) {
        updates[toggleKey] = true;
      }
      for (const sv of negSiteTags) {
        const toggleKey = SITE_TOGGLE_MAP[sv];
        if (toggleKey) updates[toggleKey] = false;
      }
    }
  }

  return updates;
}

/**
 * Search -> FilterStore: Extract date/country/range filters from AST.
 */
export interface DerivedFilters {
  dateStart?: number | null;
  dateEnd?: number | null;
  countries?: string[];
  altitudeMin?: number | null;
  altitudeMax?: number | null;
  flightSpeedMin?: number | null;
  flightSpeedMax?: number | null;
}

export function deriveFiltersFromAST(
  node: QueryNode | null,
  now: number,
): DerivedFilters {
  const tags = extractTags(node);
  const result: DerivedFilters = {};

  const sinceTags = tags.filter((t) => t.prefix.toLowerCase() === 'since' && !t.negated);
  const beforeTags = tags.filter((t) => t.prefix.toLowerCase() === 'before' && !t.negated);
  const countryTags = tags.filter((t) => t.prefix.toLowerCase() === 'country' && !t.negated);
  const altitudeTags = tags.filter((t) => t.prefix.toLowerCase() === 'altitude' && !t.negated);
  const speedTags = tags.filter((t) => t.prefix.toLowerCase() === 'speed' && !t.negated);

  if (sinceTags.length > 0) {
    result.dateStart = parseTemporalValue(sinceTags[0].value, now);
  }
  if (beforeTags.length > 0) {
    result.dateEnd = parseTemporalValue(beforeTags[0].value, now);
  }
  if (countryTags.length > 0) {
    result.countries = countryTags.map((t) => t.value);
  }
  if (altitudeTags.length > 0) {
    const { min, max } = rangeToMinMax(altitudeTags[0].value);
    result.altitudeMin = min;
    result.altitudeMax = max;
  }
  if (speedTags.length > 0) {
    const { min, max } = rangeToMinMax(speedTags[0].value);
    result.flightSpeedMin = min;
    result.flightSpeedMax = max;
  }

  return result;
}

/** State shape for building AST from sidebar (toggles + filters) */
export interface SyncableState {
  // Entity type toggles
  showFlights: boolean;
  showShips: boolean;
  showAirstrikes: boolean;
  showGroundCombat: boolean;
  showTargeted: boolean;
  // Site toggles
  showNuclear: boolean;
  showNaval: boolean;
  showOil: boolean;
  showAirbase: boolean;
  showDesalination: boolean;
  showPort: boolean;
  // Boolean filter toggles
  showGroundTraffic: boolean;
  pulseEnabled: boolean;
  showHitOnly: boolean;
  // Range filters
  altitudeMin: number | null;
  altitudeMax: number | null;
  flightSpeedMin: number | null;
  flightSpeedMax: number | null;
}

/**
 * Sidebar -> Search: Build AST from toggle/filter state + existing non-synced tags.
 */
export function buildASTFromToggles(
  state: SyncableState,
  existingAST: QueryNode | null,
): QueryNode | null {
  const nodes: QueryNode[] = [];

  // Add type: tags for ON toggles
  for (const [toggleKey, typeValues] of Object.entries(TOGGLE_TYPE_MAP)) {
    if ((state as Record<string, unknown>)[toggleKey]) {
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
    if ((state as Record<string, unknown>)[toggleKey]) {
      nodes.push({
        type: 'tag',
        prefix: 'site',
        value: siteType,
        negated: false,
      });
    }
  }

  // Add boolean filter tags
  for (const [prefix, { toggle, trueValue }] of Object.entries(BOOL_TAG_MAP)) {
    if ((state as Record<string, unknown>)[toggle]) {
      nodes.push({
        type: 'tag',
        prefix,
        value: trueValue,
        negated: false,
      });
    }
  }

  // Add range filter tags
  const altValue = minMaxToRangeValue(state.altitudeMin, state.altitudeMax);
  if (altValue) {
    nodes.push({ type: 'tag', prefix: 'altitude', value: altValue, negated: false });
  }
  const speedValue = minMaxToRangeValue(state.flightSpeedMin, state.flightSpeedMax);
  if (speedValue) {
    nodes.push({ type: 'tag', prefix: 'speed', value: speedValue, negated: false });
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
  const showGroundTraffic = useUIStore((s) => s.showGroundTraffic);
  const pulseEnabled = useUIStore((s) => s.pulseEnabled);
  const showHitOnly = useUIStore((s) => s.showHitOnly);

  // Subscribe to filter ranges
  const altitudeMin = useFilterStore((s) => s.altitudeMin);
  const altitudeMax = useFilterStore((s) => s.altitudeMax);
  const flightSpeedMin = useFilterStore((s) => s.flightSpeedMin);
  const flightSpeedMax = useFilterStore((s) => s.flightSpeedMax);

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
    let hasFilterUpdates = false;
    if (filterUpdates.dateStart !== undefined) {
      useFilterStore.getState().setDateRange(
        filterUpdates.dateStart,
        useFilterStore.getState().dateEnd,
      );
      hasFilterUpdates = true;
    }
    if (filterUpdates.dateEnd !== undefined) {
      useFilterStore.getState().setDateRange(
        useFilterStore.getState().dateStart,
        filterUpdates.dateEnd,
      );
      hasFilterUpdates = true;
    }
    if (filterUpdates.countries !== undefined) {
      useFilterStore.getState().setFlightCountries(filterUpdates.countries);
      hasFilterUpdates = true;
    }
    if (filterUpdates.altitudeMin !== undefined || filterUpdates.altitudeMax !== undefined) {
      useFilterStore.getState().setAltitudeRange(
        filterUpdates.altitudeMin ?? useFilterStore.getState().altitudeMin,
        filterUpdates.altitudeMax ?? useFilterStore.getState().altitudeMax,
      );
      hasFilterUpdates = true;
    }
    if (filterUpdates.flightSpeedMin !== undefined || filterUpdates.flightSpeedMax !== undefined) {
      useFilterStore.getState().setFlightSpeedRange(
        filterUpdates.flightSpeedMin ?? useFilterStore.getState().flightSpeedMin,
        filterUpdates.flightSpeedMax ?? useFilterStore.getState().flightSpeedMax,
      );
      hasFilterUpdates = true;
    }

    if (hasFilterUpdates) {
      syncSourceRef.current = 'search';
    }

    // Clear syncSource after a microtask to allow effects to settle
    Promise.resolve().then(() => {
      if (syncSourceRef.current === 'search') {
        syncSourceRef.current = null;
      }
    });
  }, [parsedQuery]);

  // Build current syncable state for sidebar -> search sync
  const syncState: SyncableState = {
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
    showGroundTraffic,
    pulseEnabled,
    showHitOnly,
    altitudeMin,
    altitudeMax,
    flightSpeedMin,
    flightSpeedMax,
  };

  // Sidebar -> Search sync
  const prevSyncStateRef = useRef(syncState);

  useEffect(() => {
    if (syncSourceRef.current === 'search') {
      syncSourceRef.current = null;
      prevSyncStateRef.current = syncState;
      return;
    }

    // Check if state actually changed
    const prev = prevSyncStateRef.current;
    const changed = (Object.keys(syncState) as (keyof SyncableState)[]).some(
      (key) => syncState[key] !== prev[key],
    );

    if (!changed) return;

    prevSyncStateRef.current = syncState;

    // Only sync if there's an existing query (don't generate query from defaults)
    const currentQuery = useSearchStore.getState().query;
    if (!currentQuery.trim()) return;

    syncSourceRef.current = 'sidebar';
    const currentAST = useSearchStore.getState().parsedQuery;
    const newAST = buildASTFromToggles(syncState, currentAST);
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
    showGroundTraffic,
    pulseEnabled,
    showHitOnly,
    altitudeMin,
    altitudeMax,
    flightSpeedMin,
    flightSpeedMax,
  ]);
}
