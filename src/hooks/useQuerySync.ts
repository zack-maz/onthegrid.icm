import { useEffect, useRef } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useFilterStore } from '@/stores/filterStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useSiteStore } from '@/stores/siteStore';
import { useUIStore } from '@/stores/uiStore';
import { type QueryNode } from '@/lib/queryParser';
import { parseTemporalValue, parseRangeValue } from '@/lib/queryEvaluator';
import { findGeoName, GEO_NAMES } from '@/lib/geoNames';

// ─── Sync Maps ───────────────────────────────────────────────

/** All synced tag prefixes (filter-related only, no entity toggle prefixes) */
const SYNCED_PREFIXES = new Set([
  'country', 'since', 'before',
  'altitude', 'speed',
  'callsign', 'icao', 'mmsi', 'shipname', 'cameo',
  'mentions', 'heading',
  'severity',
  'actor',
  'near',
]);

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

/** Extract non-synced nodes from AST (tags whose prefixes don't map to filters) */
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
 * Search -> FilterStore: Extract date/country/range/text filters from AST.
 */
export interface DerivedFilters {
  dateStart?: number;
  dateEnd?: number;
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
    const name = nearTags[0].value;
    const lower = name.toLowerCase();
    // Try sites first
    const sites = useSiteStore.getState().sites;
    const siteMatch = sites.find((s) => s.label.toLowerCase().includes(lower));
    if (siteMatch) {
      result.proximityPin = { lat: siteMatch.lat, lng: siteMatch.lng };
    } else {
      // Try city/location lookup
      const geoMatch = findGeoName(name);
      if (geoMatch) {
        result.proximityPin = { lat: geoMatch.lat, lng: geoMatch.lng };
      } else {
        // Try parsing as lat,lng coordinates
        const parts = name.split(',');
        if (parts.length === 2) {
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lng)) {
            result.proximityPin = { lat, lng };
          }
        }
      }
    }
  }

  return result;
}

/** State shape for building AST from sidebar filters */
export interface SyncableState {
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
 * Sidebar -> Search: Build AST from filter state + existing non-synced tags.
 */
export function buildASTFromFilters(
  state: SyncableState,
  existingAST: QueryNode | null,
): QueryNode | null {
  const nodes: QueryNode[] = [];

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

  // Add severity tags (only if not all enabled -- all-enabled is default, no tag needed)
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

  // Add proximity pin as near: tag (look up closest site or city name)
  if (state.proximityPin) {
    const CLOSE_THRESHOLD = 0.05 * 0.05; // ~5km in degrees squared
    const { lat, lng } = state.proximityPin;
    let bestLabel = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    let bestDist = Infinity;

    // Check sites
    const sites = useSiteStore.getState().sites;
    for (const site of sites) {
      const d = (site.lat - lat) ** 2 + (site.lng - lng) ** 2;
      if (d < bestDist) { bestDist = d; bestLabel = site.label; }
    }

    // Check city names (only if no close site found)
    if (bestDist >= CLOSE_THRESHOLD) {
      for (const geo of GEO_NAMES) {
        const d = (geo.lat - lat) ** 2 + (geo.lng - lng) ** 2;
        if (d < bestDist) { bestDist = d; bestLabel = geo.name; }
      }
    }

    if (bestDist < CLOSE_THRESHOLD) {
      nodes.push({ type: 'tag', prefix: 'near', value: bestLabel });
    } else {
      nodes.push({ type: 'tag', prefix: 'near', value: `${lat.toFixed(2)},${lng.toFixed(2)}` });
    }
  }

  // Preserve non-synced tags from existing AST
  const nonSynced = extractNonSyncedNodes(existingAST);
  nodes.push(...nonSynced);

  return buildOrChain(nodes);
}

// ─── Hook ────────────────────────────────────────────────────

/**
 * Bidirectional sync between search bar AST and sidebar filters.
 * Uses a syncSource ref to prevent infinite loops.
 * Mount in AppShell alongside other hooks.
 */
export function useQuerySync(): void {
  const syncSourceRef = useRef<'search' | 'sidebar' | null>(null);
  const lastFlownPinRef = useRef<{ lat: number; lng: number } | null>(null);

  // Subscribe to parsedQuery changes
  const parsedQuery = useSearchStore((s) => s.parsedQuery);

  // Subscribe to filter ranges
  const altitudeMin = useFilterStore((s) => s.altitudeMin);
  const altitudeMax = useFilterStore((s) => s.altitudeMax);
  const flightSpeedMin = useFilterStore((s) => s.flightSpeedMin);
  const flightSpeedMax = useFilterStore((s) => s.flightSpeedMax);

  // Subscribe to text filter fields
  const flightCallsign = useFilterStore((s) => s.flightCallsign);
  const flightIcao = useFilterStore((s) => s.flightIcao);
  const shipMmsi = useFilterStore((s) => s.shipMmsi);
  const shipNameFilter = useFilterStore((s) => s.shipNameFilter);
  const cameoCode = useFilterStore((s) => s.cameoCode);

  // Subscribe to range fields
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

  // Reset fly-to guard when proximity pin is actually cleared in the store.
  // This is separate from the search→sidebar sync to avoid timing issues
  // where sync cycles temporarily produce undefined proximityPin.
  useEffect(() => {
    if (proximityPin === null) {
      lastFlownPinRef.current = null;
    }
  }, [proximityPin]);

  // Search -> Sidebar sync (filters only, no toggles)
  useEffect(() => {
    if (syncSourceRef.current === 'sidebar') {
      syncSourceRef.current = null;
      return;
    }

    const currentQuery = useSearchStore.getState().query;
    if (currentQuery === prevQueryRef.current) return;
    prevQueryRef.current = currentQuery;

    if (!parsedQuery) return;

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
      if (filterUpdates.proximityPin !== null) {
        const prev = lastFlownPinRef.current;
        const pin = filterUpdates.proximityPin;
        const pinChanged = !prev || prev.lat !== pin.lat || prev.lng !== pin.lng;
        if (pinChanged) {
          // Open the filters panel so the user can see the proximity controls
          useUIStore.setState({ isFiltersCollapsed: false });
          // Fly to the proximity pin location
          useNotificationStore.getState().setFlyToTarget({
            lng: pin.lng,
            lat: pin.lat,
            zoom: 8,
          });
          lastFlownPinRef.current = { lat: pin.lat, lng: pin.lng };
        }
      }
      // Ref reset is handled by the dedicated proximityPin effect below,
      // NOT here — sync cycles can produce undefined proximityPin even
      // when the pin is still active, which would incorrectly clear the guard.
    } else if (useFilterStore.getState().proximityPin !== null) {
      // Query no longer has a near: tag but filterStore still has a pin — clear it.
      // The dedicated proximityPin effect will then reset lastFlownPinRef.
      useFilterStore.getState().setProximityPin(null);
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
    const newAST = buildASTFromFilters(syncState, currentAST);
    useSearchStore.getState().setParsedQuery(newAST);
    prevQueryRef.current = useSearchStore.getState().query;

    // Clear syncSource after a microtask
    Promise.resolve().then(() => {
      if (syncSourceRef.current === 'sidebar') {
        syncSourceRef.current = null;
      }
    });
  }, [
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
