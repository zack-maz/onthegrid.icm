import { useEffect, useRef } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import { useSiteStore } from '@/stores/siteStore';
import { type QueryNode } from '@/lib/queryParser';
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

/** All synced tag prefixes */
const SYNCED_PREFIXES = new Set([
  'type', 'site', 'country', 'since', 'before',
  'ground', 'unidentified', 'status',  // boolean tags
  'altitude', 'speed',                 // existing range tags
  'callsign', 'icao', 'mmsi', 'shipname', 'cameo',  // new text tags
  'mentions', 'heading',               // new range tags
  'severity',                          // severity toggles
  'actor',                             // actor → eventCountries
  'near',                              // proximity pin
]);

/** All conflict event type values (for showEvents parent toggle detection) */
const CONFLICT_EVENT_TYPES = new Set<string>(
  Object.values(CONFLICT_TOGGLE_GROUPS).flat(),
);

// ─── AST Helpers ─────────────────────────────────────────────

/** Extract all tag nodes from an AST, walking the tree */
export function extractTags(node: QueryNode | null): Array<{ prefix: string; value: string }> {
  if (!node) return [];
  switch (node.type) {
    case 'tag':
      return [{ prefix: node.prefix, value: node.value }];
    case 'text':
      return [];
    case 'or':
      return [...extractTags(node.left), ...extractTags(node.right)];
  }
}

/** Extract non-synced nodes from AST (tags whose prefixes don't map to toggles/filters) */
function extractNonSyncedNodes(node: QueryNode | null): QueryNode[] {
  if (!node) return [];
  switch (node.type) {
    case 'tag':
      return SYNCED_PREFIXES.has(node.prefix.toLowerCase()) ? [] : [node];
    case 'text':
      return [node];
    case 'or':
      return [...extractNonSyncedNodes(node.left), ...extractNonSyncedNodes(node.right)];
  }
}

/** Build an OR chain from an array of nodes */
function buildOrChain(nodes: QueryNode[]): QueryNode | null {
  if (nodes.length === 0) return null;
  let result = nodes[0];
  for (let i = 1; i < nodes.length; i++) {
    result = { type: 'or', left: result, right: nodes[i] };
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
    .filter((t) => t.prefix.toLowerCase() === 'type')
    .map((t) => t.value.toLowerCase());
  const siteTags = tags
    .filter((t) => t.prefix.toLowerCase() === 'site')
    .map((t) => t.value.toLowerCase());

  const updates: Record<string, boolean> = {};

  // ── Boolean tags (ground, unidentified, status) ──
  for (const [prefix, { toggle, trueValue }] of Object.entries(BOOL_TAG_MAP)) {
    const boolTags = tags.filter((t) => t.prefix.toLowerCase() === prefix);
    if (boolTags.length > 0) {
      const v = boolTags[0].value.toLowerCase();
      updates[toggle] = v === trueValue;
    }
  }

  // If no type: or site: tags in query, skip type/site toggle updates
  if (typeTags.length === 0 && siteTags.length === 0) {
    return updates;
  }

  // Each type:X tag enables its toggle
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

  // Each site:X tag enables its toggle
  if (siteTags.length > 0) {
    for (const sv of siteTags) {
      const toggleKey = SITE_TOGGLE_MAP[sv];
      if (toggleKey) updates[toggleKey] = true;
    }
    updates['showSites'] = true;
  }

  return updates;
}

/**
 * Search -> FilterStore: Extract date/country/range/text filters from AST.
 */
export interface DerivedFilters {
  dateStart?: number | null;
  dateEnd?: number | null;
  flightCountries?: string[];
  eventCountries?: string[];
  altitudeMin?: number | null;
  altitudeMax?: number | null;
  flightSpeedMin?: number | null;
  flightSpeedMax?: number | null;
  flightCallsign?: string;
  flightIcao?: string;
  shipMmsi?: string;
  shipNameFilter?: string;
  cameoCode?: string;
  mentionsMin?: number | null;
  mentionsMax?: number | null;
  headingAngle?: number | null;
  showHighSeverity?: boolean;
  showMediumSeverity?: boolean;
  showLowSeverity?: boolean;
  proximityPin?: { lat: number; lng: number } | null;
}

export function deriveFiltersFromAST(
  node: QueryNode | null,
  now: number,
): DerivedFilters {
  const tags = extractTags(node);
  const result: DerivedFilters = {};

  const sinceTags = tags.filter((t) => t.prefix.toLowerCase() === 'since');
  const beforeTags = tags.filter((t) => t.prefix.toLowerCase() === 'before');
  const countryTags = tags.filter((t) => t.prefix.toLowerCase() === 'country');
  const actorTags = tags.filter((t) => t.prefix.toLowerCase() === 'actor');
  const altitudeTags = tags.filter((t) => t.prefix.toLowerCase() === 'altitude');
  const speedTags = tags.filter((t) => t.prefix.toLowerCase() === 'speed');
  const callsignTags = tags.filter((t) => t.prefix.toLowerCase() === 'callsign');
  const icaoTags = tags.filter((t) => t.prefix.toLowerCase() === 'icao');
  const mmsiTags = tags.filter((t) => t.prefix.toLowerCase() === 'mmsi');
  const shipnameTags = tags.filter((t) => t.prefix.toLowerCase() === 'shipname');
  const cameoTags = tags.filter((t) => t.prefix.toLowerCase() === 'cameo');
  const mentionsTags = tags.filter((t) => t.prefix.toLowerCase() === 'mentions');
  const headingTags = tags.filter((t) => t.prefix.toLowerCase() === 'heading');
  const severityTags = tags.filter((t) => t.prefix.toLowerCase() === 'severity');
  const nearTags = tags.filter((t) => t.prefix.toLowerCase() === 'near');

  if (sinceTags.length > 0) {
    result.dateStart = parseTemporalValue(sinceTags[0].value, now);
  }
  if (beforeTags.length > 0) {
    result.dateEnd = parseTemporalValue(beforeTags[0].value, now);
  }
  // country: syncs to BOTH flightCountries AND eventCountries
  if (countryTags.length > 0) {
    const countries = countryTags.map((t) => t.value);
    result.flightCountries = countries;
    result.eventCountries = countries;
  }
  // actor: syncs to eventCountries
  if (actorTags.length > 0) {
    const actorCountries = actorTags.map((t) => t.value);
    // Merge with any country: values already set
    result.eventCountries = [...(result.eventCountries ?? []), ...actorCountries];
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
  if (callsignTags.length > 0) {
    result.flightCallsign = callsignTags[0].value;
  }
  if (icaoTags.length > 0) {
    result.flightIcao = icaoTags[0].value;
  }
  if (mmsiTags.length > 0) {
    result.shipMmsi = mmsiTags[0].value;
  }
  if (shipnameTags.length > 0) {
    result.shipNameFilter = shipnameTags[0].value;
  }
  if (cameoTags.length > 0) {
    result.cameoCode = cameoTags[0].value;
  }
  if (mentionsTags.length > 0) {
    const { min, max } = rangeToMinMax(mentionsTags[0].value);
    result.mentionsMin = min;
    result.mentionsMax = max;
  }
  if (headingTags.length > 0) {
    const n = Number(headingTags[0].value);
    result.headingAngle = isNaN(n) ? null : n;
  }
  if (severityTags.length > 0) {
    // Reset all severity toggles then enable mentioned ones
    result.showHighSeverity = false;
    result.showMediumSeverity = false;
    result.showLowSeverity = false;
    for (const st of severityTags) {
      const v = st.value.toLowerCase();
      if (v === 'high') result.showHighSeverity = true;
      if (v === 'medium') result.showMediumSeverity = true;
      if (v === 'low') result.showLowSeverity = true;
    }
  }
  if (nearTags.length > 0) {
    // Look up site by label to get coordinates
    const siteName = nearTags[0].value.toLowerCase();
    const sites = useSiteStore.getState().sites;
    const match = sites.find((s) => s.label.toLowerCase().includes(siteName));
    if (match) {
      result.proximityPin = { lat: match.lat, lng: match.lng };
    }
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
  // Text search fields
  flightCallsign: string;
  flightIcao: string;
  shipMmsi: string;
  shipNameFilter: string;
  cameoCode: string;
  // New range fields
  mentionsMin: number | null;
  mentionsMax: number | null;
  headingAngle: number | null;
  // Severity toggles
  showHighSeverity: boolean;
  showMediumSeverity: boolean;
  showLowSeverity: boolean;
  // Country filters
  flightCountries: string[];
  eventCountries: string[];
  // Proximity
  proximityPin: { lat: number; lng: number } | null;
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
      });
    }
  }

  // Add range filter tags
  const altValue = minMaxToRangeValue(state.altitudeMin, state.altitudeMax);
  if (altValue) {
    nodes.push({ type: 'tag', prefix: 'altitude', value: altValue });
  }
  const speedValue = minMaxToRangeValue(state.flightSpeedMin, state.flightSpeedMax);
  if (speedValue) {
    nodes.push({ type: 'tag', prefix: 'speed', value: speedValue });
  }

  // Add text search field tags
  if (state.flightCallsign) {
    nodes.push({ type: 'tag', prefix: 'callsign', value: state.flightCallsign });
  }
  if (state.flightIcao) {
    nodes.push({ type: 'tag', prefix: 'icao', value: state.flightIcao });
  }
  if (state.shipMmsi) {
    nodes.push({ type: 'tag', prefix: 'mmsi', value: state.shipMmsi });
  }
  if (state.shipNameFilter) {
    nodes.push({ type: 'tag', prefix: 'shipname', value: state.shipNameFilter });
  }
  if (state.cameoCode) {
    nodes.push({ type: 'tag', prefix: 'cameo', value: state.cameoCode });
  }

  // Add new range filter tags
  const mentionsValue = minMaxToRangeValue(state.mentionsMin, state.mentionsMax);
  if (mentionsValue) {
    nodes.push({ type: 'tag', prefix: 'mentions', value: mentionsValue });
  }
  if (state.headingAngle !== null) {
    nodes.push({ type: 'tag', prefix: 'heading', value: String(state.headingAngle) });
  }

  // Add severity tags (only if not all enabled — all-enabled is default, no tag needed)
  const allSeverity = state.showHighSeverity && state.showMediumSeverity && state.showLowSeverity;
  if (!allSeverity) {
    if (state.showHighSeverity) nodes.push({ type: 'tag', prefix: 'severity', value: 'high' });
    if (state.showMediumSeverity) nodes.push({ type: 'tag', prefix: 'severity', value: 'medium' });
    if (state.showLowSeverity) nodes.push({ type: 'tag', prefix: 'severity', value: 'low' });
  }

  // Add country tags (deduplicate flight + event countries)
  const allCountries = new Set([...state.flightCountries, ...state.eventCountries]);
  for (const country of allCountries) {
    nodes.push({ type: 'tag', prefix: 'country', value: country });
  }
  // Actor tags for countries only in eventCountries (not in flightCountries)
  const actorOnly = state.eventCountries.filter((c) => !state.flightCountries.includes(c));
  for (const actor of actorOnly) {
    nodes.push({ type: 'tag', prefix: 'actor', value: actor });
  }

  // Add proximity pin as near: tag (look up closest site label)
  if (state.proximityPin) {
    const sites = useSiteStore.getState().sites;
    let closestLabel = `${state.proximityPin.lat.toFixed(2)},${state.proximityPin.lng.toFixed(2)}`;
    let closestDist = Infinity;
    for (const site of sites) {
      const dlat = site.lat - state.proximityPin.lat;
      const dlng = site.lng - state.proximityPin.lng;
      const dist = dlat * dlat + dlng * dlng;
      if (dist < closestDist) {
        closestDist = dist;
        closestLabel = site.label;
      }
    }
    // Only use site label if close enough (approx 0.05 degree ~= 5km)
    if (closestDist < 0.05 * 0.05) {
      nodes.push({ type: 'tag', prefix: 'near', value: closestLabel });
    } else {
      nodes.push({ type: 'tag', prefix: 'near', value: `${state.proximityPin.lat.toFixed(2)},${state.proximityPin.lng.toFixed(2)}` });
    }
  }

  // Preserve non-synced tags from existing AST
  const nonSynced = extractNonSyncedNodes(existingAST);
  nodes.push(...nonSynced);

  return buildOrChain(nodes);
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

  // Subscribe to new text filter fields
  const flightCallsign = useFilterStore((s) => s.flightCallsign);
  const flightIcao = useFilterStore((s) => s.flightIcao);
  const shipMmsi = useFilterStore((s) => s.shipMmsi);
  const shipNameFilter = useFilterStore((s) => s.shipNameFilter);
  const cameoCode = useFilterStore((s) => s.cameoCode);

  // Subscribe to new range fields
  const mentionsMin = useFilterStore((s) => s.mentionsMin);
  const mentionsMax = useFilterStore((s) => s.mentionsMax);
  const headingAngle = useFilterStore((s) => s.headingAngle);

  // Subscribe to severity toggles
  const showHighSeverity = useFilterStore((s) => s.showHighSeverity);
  const showMediumSeverity = useFilterStore((s) => s.showMediumSeverity);
  const showLowSeverity = useFilterStore((s) => s.showLowSeverity);

  // Subscribe to country filters
  const flightCountries = useFilterStore((s) => s.flightCountries);
  const eventCountries = useFilterStore((s) => s.eventCountries);

  // Subscribe to proximity pin
  const proximityPin = useFilterStore((s) => s.proximityPin);

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
    if (filterUpdates.flightCountries !== undefined) {
      useFilterStore.getState().setFlightCountries(filterUpdates.flightCountries);
      hasFilterUpdates = true;
    }
    if (filterUpdates.eventCountries !== undefined) {
      useFilterStore.getState().setEventCountries(filterUpdates.eventCountries);
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
    if (filterUpdates.flightCallsign !== undefined) {
      useFilterStore.getState().setFlightCallsign(filterUpdates.flightCallsign);
      hasFilterUpdates = true;
    }
    if (filterUpdates.flightIcao !== undefined) {
      useFilterStore.getState().setFlightIcao(filterUpdates.flightIcao);
      hasFilterUpdates = true;
    }
    if (filterUpdates.shipMmsi !== undefined) {
      useFilterStore.getState().setShipMmsi(filterUpdates.shipMmsi);
      hasFilterUpdates = true;
    }
    if (filterUpdates.shipNameFilter !== undefined) {
      useFilterStore.getState().setShipNameFilter(filterUpdates.shipNameFilter);
      hasFilterUpdates = true;
    }
    if (filterUpdates.cameoCode !== undefined) {
      useFilterStore.getState().setCameoCode(filterUpdates.cameoCode);
      hasFilterUpdates = true;
    }
    if (filterUpdates.mentionsMin !== undefined || filterUpdates.mentionsMax !== undefined) {
      useFilterStore.getState().setMentionsRange(
        filterUpdates.mentionsMin ?? useFilterStore.getState().mentionsMin,
        filterUpdates.mentionsMax ?? useFilterStore.getState().mentionsMax,
      );
      hasFilterUpdates = true;
    }
    if (filterUpdates.headingAngle !== undefined) {
      useFilterStore.getState().setHeadingAngle(filterUpdates.headingAngle);
      hasFilterUpdates = true;
    }
    if (filterUpdates.showHighSeverity !== undefined) {
      useFilterStore.getState().setShowHighSeverity(filterUpdates.showHighSeverity);
      hasFilterUpdates = true;
    }
    if (filterUpdates.showMediumSeverity !== undefined) {
      useFilterStore.getState().setShowMediumSeverity(filterUpdates.showMediumSeverity);
      hasFilterUpdates = true;
    }
    if (filterUpdates.showLowSeverity !== undefined) {
      useFilterStore.getState().setShowLowSeverity(filterUpdates.showLowSeverity);
      hasFilterUpdates = true;
    }
    if (filterUpdates.proximityPin !== undefined) {
      useFilterStore.getState().setProximityPin(filterUpdates.proximityPin);
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
    flightCallsign,
    flightIcao,
    shipMmsi,
    shipNameFilter,
    cameoCode,
    mentionsMin,
    mentionsMax,
    headingAngle,
    showHighSeverity,
    showMediumSeverity,
    showLowSeverity,
    flightCountries,
    eventCountries,
    proximityPin,
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
      (key) => {
        const curr = syncState[key];
        const prevVal = prev[key];
        // Deep compare arrays
        if (Array.isArray(curr) && Array.isArray(prevVal)) {
          return curr.length !== prevVal.length || curr.some((v, i) => v !== (prevVal as unknown[])[i]);
        }
        // Deep compare objects (proximityPin)
        if (curr !== null && typeof curr === 'object' && !Array.isArray(curr) &&
            prevVal !== null && typeof prevVal === 'object' && !Array.isArray(prevVal)) {
          return JSON.stringify(curr) !== JSON.stringify(prevVal);
        }
        return curr !== prevVal;
      },
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
    flightCallsign,
    flightIcao,
    shipMmsi,
    shipNameFilter,
    cameoCode,
    mentionsMin,
    mentionsMax,
    headingAngle,
    showHighSeverity,
    showMediumSeverity,
    showLowSeverity,
    flightCountries,
    eventCountries,
    proximityPin,
  ]);
}
