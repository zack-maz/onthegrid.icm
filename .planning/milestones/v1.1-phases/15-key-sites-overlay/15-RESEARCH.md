# Phase 15: Key Sites Overlay - Research

**Researched:** 2026-03-20
**Domain:** Overpass API integration, Deck.gl IconLayer extension, Zustand store patterns, canvas icon atlas
**Confidence:** HIGH

## Summary

Phase 15 adds a static infrastructure layer showing key sites (nuclear, naval, oil refinery, airbase, dam, port) on the map. The implementation follows well-established patterns already in the codebase: a new server adapter fetches data from the Overpass API, a new route caches it in Redis for 24h, a new Zustand store holds the data client-side, and a new Deck.gl IconLayer renders the sites using the existing icon atlas (extended with 6 new shapes). Toggle controls, tooltip, and detail panel follow the exact same patterns used for flights, ships, and events.

The Overpass API is free with no authentication required. The main risk is rate limiting on the public endpoint, which is fully mitigated by the 24h Redis cache -- after the first cold request, all subsequent requests serve cached data. The site data is static reference data (infrastructure locations don't change), so a single fetch on app load with 24h server cache is the correct approach. Attack status computation (green/orange coloring based on proximity to GDELT conflict events) is done client-side, reusing the event store data already available.

**Primary recommendation:** Follow the existing adapter/route/store/layer pattern exactly. The Overpass QL union query fetches all 6 site types in a single request. Sites are NOT part of the MapEntity discriminated union -- they get their own SiteEntity type and siteStore, but share the same detail panel routing, tooltip, and toggle infrastructure patterns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- 6 new canvas-drawn symbolic silhouettes added to existing icon atlas: atom (nuclear), anchor (naval), oil derrick (oil), jet silhouette (airbase), water waves (dam), ship's helm wheel (port)
- Same mask-mode approach as existing icons -- white shapes tinted via `getColor`
- Two-state color: green (#22c55e) for healthy sites, orange (#f97316) for attacked sites
- "Attacked" = any GDELT conflict event within ~2km radius of the site at any point since Feb 28, 2026 (WAR_START)
- Attack status computed client-side from event store data, respects date range filter temporally
- Attack status uses ALL backfilled events, not just the default 24h view
- Sizing: 4000m base, minPixels:12, maxPixels:80
- Parent "Sites" toggle + 6 indented sub-toggles (Nuclear, Naval, Oil, Airbase, Dam, Port) positioned after Events
- All ON by default; parent toggle ON restores all sub-toggles
- NOT suppressed during custom date range mode
- Toggle state persisted to localStorage
- Hover tooltip: site name, location, attack status with date
- Click detail panel: SiteDetail component with name, type, operator, coordinates (copy button), minimap preview, attack history section
- Single fetch on app load -- GET /api/sites, no polling
- Server: 24h Redis cache (key: `sites:all`), cache miss queries Overpass API
- Single combined Overpass QL query with OR clauses for all 6 site types, scoped to Greater Middle East bbox
- Separate SiteEntity type and siteStore (NOT part of MapEntity union)
- useSelectedEntity extended to include siteStore lookup
- Own Deck.gl IconLayer, own detail component (SiteDetail)

### Claude's Discretion
- Exact Overpass QL tag queries per site type (researcher should identify correct OSM tags)
- Canvas drawing details for the 6 new icon shapes
- Minimap embed implementation approach (static image vs iframe vs MapLibre mini instance)
- Attack status computation optimization (spatial index vs brute force)
- Error/loading states for initial site fetch

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SITE-01 | User can see key infrastructure sites (nuclear, naval, oil refinery, airbase, dam, port) on the map via Overpass API with distinct icons per type | OSM tag queries per site type identified; icon atlas extension pattern documented; Overpass API endpoint and response format verified; Deck.gl IconLayer pattern matches existing codebase |
| SITE-02 | User can toggle site visibility per type (parent toggle + 6 sub-toggles) | LayerToggles interface extension pattern documented; toggle row component reuse; localStorage persistence follows existing pattern; parent/child toggle behavior mirrors Events group |
| SITE-03 | User can click a site marker to inspect its details (name, type, coordinates, operator, OSM link) in the detail panel | SiteDetail component follows EventDetail pattern; useSelectedEntity extension documented; DetailPanelSlot routing extension documented; attack history cross-links to events |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Overpass API | v0.7.x | OSM data query (sites) | Free, no auth, industry standard for OSM queries |
| @deck.gl/layers | ^9.2.11 | IconLayer for site rendering | Already in project; same layer type used for all entity categories |
| zustand | ^5.0.11 | siteStore state management | Already in project; curried create pattern established |
| @upstash/redis | ^1.37.0 | 24h site cache | Already in project; cacheGet/cacheSet pattern established |
| express | ^5.2.1 | /api/sites route | Already in project; Router pattern established |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new | -- | All required libraries already in project | -- |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Overpass API | Pre-bundled JSON file | Eliminates API dependency but data becomes stale; Overpass with 24h cache is better |
| Client-side brute force attack check | R-tree spatial index | Brute force O(sites * events) is fine for ~100-200 sites * ~1000 events; spatial index adds complexity for no measurable gain |
| MapLibre mini instance (minimap) | Static tile image via URL | MapLibre mini would be interactive but heavy (second GL context); static image is simpler and lighter |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
server/
  adapters/overpass.ts          # Overpass API adapter (fetchSites)
  routes/sites.ts               # GET /api/sites route with 24h cache
src/
  types/sites.ts                # SiteType, SiteEntity types
  stores/siteStore.ts           # Zustand store for site data
  hooks/useSiteFetch.ts         # Single fetch on mount (no polling)
  components/detail/SiteDetail.tsx  # Detail panel content
  components/map/layers/icons.ts    # Extended with 6 new shapes (13 total)
```

### Pattern 1: Overpass QL Union Query (Single Combined Request)
**What:** One Overpass QL query fetches all 6 site types using union syntax with bbox
**When to use:** Always -- single request is more efficient than 6 separate queries
**Example:**
```typescript
// Source: Overpass API documentation (https://dev.overpass-api.de/overpass-doc/en/criteria/union.html)
const query = `
[out:json][timeout:60];
(
  // Nuclear facilities
  nwr["plant:source"="nuclear"](${bbox});
  nwr["generator:source"="nuclear"](${bbox});
  // Naval bases
  nwr["military"="naval_base"](${bbox});
  nwr["military"="base"]["military_service"="navy"](${bbox});
  // Oil refineries
  nwr["industrial"="refinery"](${bbox});
  nwr["industrial"="oil_refinery"](${bbox});
  nwr["man_made"="petroleum_well"](${bbox});
  // Military airfields
  nwr["military"="airfield"](${bbox});
  nwr["aeroway"="aerodrome"]["aerodrome:type"="military"](${bbox});
  // Dams
  nwr["waterway"="dam"](${bbox});
  // Ports
  nwr["industrial"="port"](${bbox});
  nwr["harbour"="yes"](${bbox});
  nwr["landuse"="port"](${bbox});
);
out center tags;
`;
```

### Pattern 2: SiteEntity Separate from MapEntity
**What:** Sites are NOT part of the MapEntity discriminated union. They get their own type.
**When to use:** Sites are static reference data, not live telemetry. Different lifecycle (24h cache, no polling, no stale clearing).
**Example:**
```typescript
// Source: project pattern (server/types.ts MapEntity union)
export type SiteType = 'nuclear' | 'naval' | 'oil' | 'airbase' | 'dam' | 'port';

export interface SiteEntity {
  id: string;          // "site-<osmId>"
  type: 'site';        // Literal type for routing
  siteType: SiteType;  // Discriminator for icon/color
  lat: number;
  lng: number;
  label: string;       // Site name from OSM tags
  operator?: string;   // operator= tag from OSM
  osmId: number;       // Raw OSM ID for linking
}
```

### Pattern 3: Client-Side Attack Status Computation
**What:** Compare each site's coordinates against all GDELT events within 2km radius
**When to use:** On every render/change of event data or date range filter
**Example:**
```typescript
// Haversine distance check -- reuse existing geo utility if available
const ATTACK_RADIUS_KM = 2;

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// For each site, find attacks within radius
function computeAttackStatus(
  site: SiteEntity,
  events: ConflictEventEntity[],
  dateStart: number | null,
  dateEnd: number | null,
): { isAttacked: boolean; attackDate: number | null; attackCount: number } {
  const attacks = events.filter(e => {
    // Temporal filter: respect date range
    if (dateStart !== null && e.timestamp < dateStart) return false;
    if (dateEnd !== null && e.timestamp > dateEnd) return false;
    // Spatial filter: within 2km
    return haversineDistanceKm(site.lat, site.lng, e.lat, e.lng) <= ATTACK_RADIUS_KM;
  });
  return {
    isAttacked: attacks.length > 0,
    attackDate: attacks.length > 0 ? Math.max(...attacks.map(a => a.timestamp)) : null,
    attackCount: attacks.length,
  };
}
```

### Pattern 4: Icon Atlas Extension
**What:** Extend the 224x32 canvas to 416x32 (13 icons * 32px) with 6 new site shapes
**When to use:** When adding new icon shapes to the atlas
**Example:**
```typescript
// Source: existing pattern in src/components/map/layers/icons.ts
// Current atlas: 224px wide (7 icons), extend to 416px (13 icons)
// New entries in ICON_MAPPING:
export const ICON_MAPPING: Record<string, IconEntry> = {
  // ... existing 7 icons (0-6) ...
  siteNuclear:  { x: 224, y: 0, width: 32, height: 32, mask: true },  // atom symbol
  siteNaval:    { x: 256, y: 0, width: 32, height: 32, mask: true },  // anchor
  siteOil:      { x: 288, y: 0, width: 32, height: 32, mask: true },  // oil derrick
  siteAirbase:  { x: 320, y: 0, width: 32, height: 32, mask: true },  // jet silhouette
  siteDam:      { x: 352, y: 0, width: 32, height: 32, mask: true },  // water waves
  sitePort:     { x: 384, y: 0, width: 32, height: 32, mask: true },  // helm wheel
};
```

### Pattern 5: Toggle Extension (Sites Group)
**What:** Add showSites parent + 6 sub-toggles to LayerToggles interface
**When to use:** Following the Events toggle group pattern exactly
**Example:**
```typescript
// In src/types/ui.ts -- extend LayerToggles
export interface LayerToggles {
  // ... existing toggles ...
  showSites: boolean;
  showNuclear: boolean;
  showNaval: boolean;
  showOil: boolean;
  showAirbase: boolean;
  showDam: boolean;
  showPort: boolean;
}

export const LAYER_TOGGLE_DEFAULTS: LayerToggles = {
  // ... existing defaults ...
  showSites: true,
  showNuclear: true,
  showNaval: true,
  showOil: true,
  showAirbase: true,
  showDam: true,
  showPort: true,
};
```

### Anti-Patterns to Avoid
- **Adding SiteEntity to MapEntity union:** Sites are fundamentally different (static reference data vs live telemetry). Adding to the union would contaminate flight/ship/event filtering, polling, and stale-clearing logic.
- **Polling for site data:** Sites don't change. Single fetch + 24h cache is correct. Adding polling wastes API quota and Redis commands.
- **Server-side attack status:** Events change frequently; computing on the server means stale attack status between poll intervals. Client-side computation with reactive event data is more responsive and simpler.
- **Individual Overpass queries per type:** One union query is faster and uses fewer API slots than 6 separate queries.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OSM data fetching | Custom OSM XML parser | Overpass API with `[out:json]` format | JSON response eliminates XML parsing entirely |
| Distance calculation | Simplified lat/lng subtraction | Haversine formula | Accurate at Middle East latitudes; simple function, 10 lines |
| Icon rendering | SVG imports or image files | Canvas-drawn shapes in icon atlas | Matches existing pattern; mask mode tinting; single texture upload |
| Toggle persistence | Custom state sync | Existing localStorage pattern in uiStore | Already battle-tested with migration support |
| Cache layer | Custom file-based cache | Existing Redis cacheGet/cacheSet | Already deployed and tested; 24h TTL is trivial config |

**Key insight:** Nearly everything this phase needs is an extension of an existing pattern. The only truly new code is the Overpass adapter and the 6 canvas icon drawings.

## Common Pitfalls

### Pitfall 1: Overpass API Rate Limiting
**What goes wrong:** Overpass public instances throttle per-IP. Heavy use returns 429 or connection timeout.
**Why it happens:** Cloud IP ranges (AWS, Vercel) may be pre-throttled; Overpass limits concurrent slots per IP.
**How to avoid:** 24h Redis cache means at most 1 Overpass call per day. Add a fallback to a secondary Overpass instance (`overpass.kumi.systems` or `overpass.private.coffee`). Set a reasonable timeout (60s). Return empty array + log warning on failure (non-fatal).
**Warning signs:** 429 responses, connection timeouts during cold cache.

### Pitfall 2: Overpass Response for Ways vs Nodes
**What goes wrong:** Many infrastructure sites are mapped as ways (area outlines) or relations, not point nodes. Without `out center`, ways have no single lat/lng.
**Why it happens:** OSM maps large facilities as polygons, not points.
**How to avoid:** Always use `out center` in the Overpass query. For nodes, use `lat`/`lon` directly. For ways/relations, use `center.lat`/`center.lon`. The normalizer must handle both cases.
**Warning signs:** Sites showing up at (0,0) or missing entirely.

### Pitfall 3: OSM Tag Inconsistency
**What goes wrong:** Different mappers use different tags for the same type of facility. E.g., oil refineries may be tagged `industrial=refinery` OR `industrial=oil_refinery` OR `man_made=works` + `product=petroleum`.
**Why it happens:** OSM tagging is community-driven with varying conventions.
**How to avoid:** Use multiple tag variants in the Overpass union query (documented below in OSM Tags section). Cast a wide net, then deduplicate by OSM ID.
**Warning signs:** Missing known facilities; check against a known reference list for Iran.

### Pitfall 4: Icon Atlas Cache Invalidation
**What goes wrong:** Existing cached atlas canvas is 224px wide. After extending to 416px, the old cached canvas is returned.
**Why it happens:** The `atlas` variable caches the first generated canvas. If module hot-reload doesn't clear it, stale atlas persists.
**How to avoid:** The cache is module-scoped and resets on full page reload. Not an issue in production (single load). In dev, HMR will reimport the module. Reset `atlas = null` at the top of `getIconAtlas()` if width doesn't match.
**Warning signs:** New icon shapes rendering as blank/transparent in dev.

### Pitfall 5: Attack Status Performance on Large Event Sets
**What goes wrong:** O(sites * events) brute force with Haversine is slow for thousands of events.
**Why it happens:** Backfilled GDELT events can grow to several thousand over weeks of war.
**How to avoid:** Pre-filter events by a coarse bbox check before Haversine (skip events more than ~0.02 degrees away, which is ~2km at 30-degree latitude). Memoize per site+events hash. With ~200 sites and ~2000 events, even unoptimized is only 400K simple comparisons -- fast enough.
**Warning signs:** Visible lag when switching date range or receiving new events.

### Pitfall 6: localStorage Migration
**What goes wrong:** Adding 7 new toggle keys to LayerToggles breaks deserialization of old stored values.
**Why it happens:** Old stored JSON doesn't have the new keys. Spread with defaults handles missing keys, but if someone had a different schema, migration logic may reset everything.
**How to avoid:** The existing `{ ...LAYER_TOGGLE_DEFAULTS, ...parsed }` spread pattern in `loadPersistedToggles` already handles this correctly -- missing keys get defaults. No special migration needed.
**Warning signs:** Toggles resetting to defaults on first load after deploy (expected, non-harmful).

## Code Examples

### Overpass API Adapter
```typescript
// server/adapters/overpass.ts
// Source: Overpass API docs (https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)

import type { SiteEntity, SiteType } from '../types.js';
import { IRAN_BBOX } from '../constants.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_FALLBACK = 'https://overpass.private.coffee/api/interpreter';
const TIMEOUT_MS = 60_000;

// bbox format for Overpass: south,west,north,east
const bbox = `${IRAN_BBOX.south},${IRAN_BBOX.west},${IRAN_BBOX.north},${IRAN_BBOX.east}`;

const QUERY = `
[out:json][timeout:60][bbox:${bbox}];
(
  nwr["plant:source"="nuclear"];
  nwr["generator:source"="nuclear"];
  nwr["military"="naval_base"];
  nwr["military"="base"]["military_service"="navy"];
  nwr["industrial"="refinery"];
  nwr["industrial"="oil_refinery"];
  nwr["military"="airfield"];
  nwr["aeroway"="aerodrome"]["aerodrome:type"="military"];
  nwr["waterway"="dam"];
  nwr["industrial"="port"];
  nwr["harbour"="yes"];
  nwr["landuse"="port"];
);
out center tags;
`;

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function classifySiteType(tags: Record<string, string>): SiteType | null {
  if (tags['plant:source'] === 'nuclear' || tags['generator:source'] === 'nuclear') return 'nuclear';
  if (tags['military'] === 'naval_base' || tags['military_service'] === 'navy') return 'naval';
  if (tags['industrial'] === 'refinery' || tags['industrial'] === 'oil_refinery') return 'oil';
  if (tags['military'] === 'airfield' || tags['aerodrome:type'] === 'military') return 'airbase';
  if (tags['waterway'] === 'dam') return 'dam';
  if (tags['industrial'] === 'port' || tags['harbour'] === 'yes' || tags['landuse'] === 'port') return 'port';
  return null;
}

function normalizeElement(el: OverpassElement): SiteEntity | null {
  if (!el.tags) return null;
  const siteType = classifySiteType(el.tags);
  if (!siteType) return null;

  // Nodes have lat/lon directly; ways/relations have center
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  return {
    id: `site-${el.id}`,
    type: 'site',
    siteType,
    lat,
    lng: lon,
    label: el.tags.name || el.tags['name:en'] || `${siteType} facility`,
    operator: el.tags.operator || undefined,
    osmId: el.id,
  };
}

export async function fetchSites(): Promise<SiteEntity[]> {
  // Try primary, fallback to secondary
  for (const url of [OVERPASS_URL, OVERPASS_FALLBACK]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(QUERY)}`,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(`[overpass] ${url} returned ${res.status}`);
        continue;
      }
      const json = await res.json() as { elements: OverpassElement[] };

      // Normalize and deduplicate by OSM ID
      const siteMap = new Map<number, SiteEntity>();
      for (const el of json.elements) {
        const site = normalizeElement(el);
        if (site) siteMap.set(el.id, site);
      }
      return Array.from(siteMap.values());
    } catch (err) {
      console.warn(`[overpass] ${url} failed:`, (err as Error).message);
    }
  }
  throw new Error('All Overpass API instances failed');
}
```

### Site Route with 24h Cache
```typescript
// server/routes/sites.ts
// Source: existing pattern in server/routes/events.ts

import { Router } from 'express';
import { cacheGet, cacheSet } from '../cache/redis.js';
import { fetchSites } from '../adapters/overpass.js';
import type { SiteEntity } from '../types.js';

const SITES_KEY = 'sites:all';
const LOGICAL_TTL_MS = 86_400_000; // 24 hours
const REDIS_TTL_SEC = 259_200;     // 3 days (fallback window)

export const sitesRouter = Router();

sitesRouter.get('/', async (_req, res) => {
  const cached = await cacheGet<SiteEntity[]>(SITES_KEY, LOGICAL_TTL_MS);

  if (cached && !cached.stale) {
    return res.json(cached);
  }

  try {
    const sites = await fetchSites();
    await cacheSet(SITES_KEY, sites, REDIS_TTL_SEC);
    res.json({ data: sites, stale: false, lastFresh: Date.now() });
  } catch (err) {
    console.error('[sites] Overpass error:', (err as Error).message);
    if (cached) {
      res.json({ data: cached.data, stale: true, lastFresh: cached.lastFresh });
    } else {
      throw err;
    }
  }
});
```

### Site Store (Zustand)
```typescript
// src/stores/siteStore.ts
// Source: existing pattern in src/stores/eventStore.ts

import { create } from 'zustand';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading' | 'idle';

interface SiteState {
  sites: SiteEntity[];
  connectionStatus: ConnectionStatus;
  siteCount: number;
  setSiteData: (response: { data: SiteEntity[]; stale: boolean }) => void;
  setError: () => void;
  setLoading: () => void;
}

export const useSiteStore = create<SiteState>()((set) => ({
  sites: [],
  connectionStatus: 'idle',
  siteCount: 0,

  setSiteData: (response) =>
    set({
      sites: response.data,
      siteCount: response.data.length,
      connectionStatus: response.stale ? 'stale' : 'connected',
    }),

  setError: () => set({ connectionStatus: 'error' }),
  setLoading: () => set({ connectionStatus: 'loading' }),
}));
```

### Minimap Embed Recommendation
```typescript
// Recommendation: Use a static tile image URL, NOT a MapLibre mini instance
// Why: A second GL context is heavyweight (~5MB extra), and the detail panel
// only needs a small preview. Static tiles from the same style source work well.
//
// Pattern: Render a 200x120px <img> with a pre-computed tile URL based on site coords
// The "Open in OSM" button links to https://www.openstreetmap.org/?mlat={lat}&mlon={lng}#map=15/{lat}/{lng}

const osmUrl = (lat: number, lng: number, zoom = 15) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;

// For the static preview image, use the same map tile source at a fixed zoom:
// e.g. https://tile.openstreetmap.org/{z}/{x}/{y}.png
// Calculate tile x/y from lat/lng at zoom 14
```

## OSM Tags Per Site Type (Verified)

| Site Type | Primary Tags | Fallback Tags | Source |
|-----------|-------------|---------------|--------|
| Nuclear | `plant:source=nuclear` | `generator:source=nuclear` | [OSM Wiki](https://wiki.openstreetmap.org/wiki/Tag:generator:source=nuclear) |
| Naval | `military=naval_base` | `military=base` + `military_service=navy` | [OSM Wiki](https://wiki.openstreetmap.org/wiki/Tag:military=naval_base) |
| Oil Refinery | `industrial=refinery` | `industrial=oil_refinery` | [OSM Wiki](https://wiki.openstreetmap.org/wiki/Oil_and_Gas_Infrastructure) |
| Airbase | `military=airfield` | `aeroway=aerodrome` + `aerodrome:type=military` | [OSM Wiki](https://wiki.openstreetmap.org/wiki/Tag:military=airfield) |
| Dam | `waterway=dam` | -- | [OSM Wiki](https://wiki.openstreetmap.org/wiki/Tag:waterway=dam) |
| Port | `industrial=port` | `harbour=yes`, `landuse=port` | [OSM Wiki](https://wiki.openstreetmap.org/wiki/Tag:industrial=port) |

**Note:** `nwr` in Overpass QL means "node, way, relation" -- searches all element types. Combined with `out center tags`, this ensures we get coordinates for all elements regardless of how they're mapped (point vs polygon).

**Potential issue with dams:** The Middle East bbox may return hundreds of small dams. Consider filtering by `name` tag presence or adding a minimum `dam:height` filter if count is too high. Alternatively, apply the query only to the specific countries of interest within the bbox.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `military=naval_base` (single tag) | `military=base` + `military_service=navy` (combination) | Ongoing deprecation | Query BOTH to catch all naval facilities |
| `landuse=port` (single tag) | `landuse=industrial` + `industrial=port` | Ongoing migration | Query BOTH old and new tag conventions |
| Single Overpass endpoint | Multiple public instances with fallback | 2024-2025 (rate limiting changes) | Must implement fallback for reliability |

**Deprecated/outdated:**
- `military=naval_base`: Deprecated in favor of `military=base` + `military_service=navy`, but still widely used in OSM data. Query both.

## Open Questions

1. **Dam count may be excessive**
   - What we know: `waterway=dam` in the Greater Middle East bbox (0-50N, 20-80E) could return hundreds of small irrigation dams.
   - What's unclear: Exact count; whether filtering by name or minimum size is needed.
   - Recommendation: Add `name` tag presence as a secondary filter (only show named dams). Can be adjusted after seeing real data.

2. **Port count may be excessive**
   - What we know: Many small harbours exist along Mediterranean and Persian Gulf coasts.
   - What's unclear: Whether `harbour=yes` returns too many small marinas.
   - Recommendation: Consider limiting to `industrial=port` + `landuse=port` for major ports. Drop `harbour=yes` if count exceeds ~50.

3. **Minimap implementation: static image vs MapLibre instance**
   - What we know: User wants a "minimap preview" in the detail panel. A full MapLibre GL instance doubles WebGL context count.
   - What's unclear: Whether a static tile image is sufficient or if an interactive mini-map is expected.
   - Recommendation: Use a static tile image (single `<img>` element) with an "Open in OSM" link for full interactivity. Simpler, lighter, no WebGL cost. If the user finds it insufficient, upgrade to MapLibre in a follow-up.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vite.config.ts` (test section) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SITE-01a | Overpass adapter normalizes elements to SiteEntity | unit | `npx vitest run server/__tests__/adapters/overpass.test.ts -x` | Wave 0 |
| SITE-01b | Sites route returns cached data / fetches on miss | unit | `npx vitest run server/__tests__/routes/sites.test.ts -x` | Wave 0 |
| SITE-01c | siteStore sets/clears site data correctly | unit | `npx vitest run src/__tests__/siteStore.test.ts -x` | Wave 0 |
| SITE-01d | Site IconLayer renders with correct icon per siteType | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | Extend existing |
| SITE-02a | LayerToggles includes 7 new site toggle keys with defaults | unit | `npx vitest run src/__tests__/uiStore.test.ts -x` | Extend existing |
| SITE-02b | LayerTogglesSlot renders site toggle rows | unit | `npx vitest run src/__tests__/LayerToggles.test.tsx -x` | Extend existing |
| SITE-02c | Parent Sites toggle restores all sub-toggles | unit | `npx vitest run src/__tests__/uiStore.test.ts -x` | Extend existing |
| SITE-03a | useSelectedEntity finds entity in siteStore | unit | `npx vitest run src/__tests__/useSelectedEntity.test.ts -x` | Extend existing |
| SITE-03b | DetailPanelSlot routes to SiteDetail for site type | unit | `npx vitest run src/__tests__/DetailPanel.test.tsx -x` | Extend existing |
| SITE-03c | Attack status computation returns correct results | unit | `npx vitest run src/__tests__/attackStatus.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/__tests__/adapters/overpass.test.ts` -- covers SITE-01a (Overpass adapter)
- [ ] `server/__tests__/routes/sites.test.ts` -- covers SITE-01b (sites route)
- [ ] `src/__tests__/siteStore.test.ts` -- covers SITE-01c (site store)
- [ ] `src/__tests__/attackStatus.test.ts` -- covers SITE-03c (attack computation)

## Sources

### Primary (HIGH confidence)
- OpenStreetMap Wiki: Overpass API/Overpass QL -- query syntax, union blocks, bbox, `out center` format
- OpenStreetMap Wiki: Tag pages for `military=airfield`, `military=naval_base`, `generator:source=nuclear`, `waterway=dam`, `industrial=port`, `industrial=refinery` -- OSM tag conventions
- Overpass API documentation: `dev.overpass-api.de` -- JSON response format, output modes, timeout settings
- Project codebase: Existing adapter/route/store/layer patterns (server/adapters/*.ts, server/routes/*.ts, src/stores/*.ts, src/hooks/useEntityLayers.ts)

### Secondary (MEDIUM confidence)
- Overpass API public instances list -- verified via OSM Wiki, `overpass.kumi.systems` now at `overpass.private.coffee`
- Overpass rate limiting behavior -- IP-based throttling, 429 responses, cloud IP ranges may be pre-throttled

### Tertiary (LOW confidence)
- Exact dam/port counts in Greater Middle East bbox -- untested; may need filtering adjustment after first real query

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project; Overpass API is well-documented and free
- Architecture: HIGH - Every pattern (adapter, route, cache, store, layer, toggle, detail) has a direct precedent in the codebase
- OSM tags: MEDIUM - Tag conventions verified via OSM Wiki, but real-world tagging varies by region and mapper
- Pitfalls: HIGH - Rate limiting, way-vs-node handling, and tag inconsistency are well-documented issues

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable domain; OSM tags and Overpass API change slowly)
