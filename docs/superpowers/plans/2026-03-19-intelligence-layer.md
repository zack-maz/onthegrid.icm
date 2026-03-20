# v1.1 Intelligence Layer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add key infrastructure sites overlay, news feed, notification center with severity scoring, oil markets tracker, search/filter/UI cleanup, and production deploy sync to the Iran Conflict Monitor.

**Architecture:** Six sequential phases. Phases 15–16 build independent data pipelines (sites, news). Phase 17 combines them into a notification center and adds the 24h event default. Phase 18 adds an independent markets tracker. Phase 19 cleans up search/filter/UI. Phase 20 verifies and deploys.

**Tech Stack:** React 19, TypeScript strict, Zustand 5 (curried create), Deck.gl IconLayer, Express 5, Upstash Redis, Vitest, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-19-intelligence-layer-design.md`

---

## File Map

### Phase 15: Key Sites Overlay
| Action | File |
|--------|------|
| Create | `server/adapters/overpass.ts` |
| Create | `server/routes/sites.ts` |
| Create | `src/stores/siteStore.ts` |
| Create | `src/hooks/useSitePolling.ts` |
| Create | `src/components/detail/SiteDetail.tsx` |
| Create | `server/__tests__/adapters/overpass.test.ts` |
| Create | `server/__tests__/routes/sites.test.ts` |
| Create | `src/__tests__/siteStore.test.ts` |
| Create | `src/__tests__/useSitePolling.test.ts` |
| Modify | `server/types.ts` — add `SiteEntity`, `'site'` to `EntityType` |
| Modify | `src/types/entities.ts` — re-export `SiteEntity` |
| Modify | `src/types/ui.ts` — add site toggle fields to `LayerToggles` |
| Modify | `server/index.ts` — register `/api/sites` |
| Modify | `src/stores/uiStore.ts` — add site toggle state + actions |
| Modify | `src/hooks/useSelectedEntity.ts` — search siteStore |
| Modify | `src/components/layout/LayerTogglesSlot.tsx` — add site toggles |
| Modify | `src/components/layout/AppShell.tsx` — wire useSitePolling |
| Modify | `src/components/layout/DetailPanelSlot.tsx` — render SiteDetail |
| Modify | `src/components/map/BaseMap.tsx` — add site IconLayer, shrink event icons |

### Phase 16: News Feed
| Action | File |
|--------|------|
| Create | `server/adapters/news.ts` |
| Create | `server/routes/news.ts` |
| Create | `src/stores/newsStore.ts` |
| Create | `src/hooks/useNewsPolling.ts` |
| Create | `server/__tests__/adapters/news.test.ts` |
| Create | `server/__tests__/routes/news.test.ts` |
| Create | `src/__tests__/newsStore.test.ts` |
| Create | `src/__tests__/useNewsPolling.test.ts` |
| Modify | `server/index.ts` — register `/api/news` |
| Modify | `src/components/layout/AppShell.tsx` — wire useNewsPolling |

### Phase 17: Notification Center
| Action | File |
|--------|------|
| Create | `server/routes/notifications.ts` |
| Create | `src/stores/notificationStore.ts` |
| Create | `src/components/layout/NotificationDrawer.tsx` |
| Create | `src/components/notifications/NotificationCard.tsx` |
| Create | `server/__tests__/routes/notifications.test.ts` |
| Create | `src/__tests__/notificationStore.test.ts` |
| Create | `src/__tests__/NotificationDrawer.test.tsx` |
| Modify | `server/index.ts` — register `/api/notifications` |
| Modify | `src/stores/filterStore.ts` — add `DEFAULT_EVENT_WINDOW_MS` constant |
| Modify | `src/stores/uiStore.ts` — add `isNotificationDrawerOpen`, actions |
| Modify | `src/hooks/useEntityLayers.ts` — apply 24h window when `dateStart` is null |
| Modify | `src/components/layout/AppShell.tsx` — mount NotificationDrawer, add offset var |
| Modify | `src/components/layout/DetailPanelSlot.tsx` — respect `--notification-drawer-offset` |

### Phase 18: Oil Markets Tracker
| Action | File |
|--------|------|
| Create | `server/adapters/yahoo-finance.ts` |
| Create | `server/routes/markets.ts` |
| Create | `src/stores/marketStore.ts` |
| Create | `src/hooks/useMarketPolling.ts` |
| Create | `src/components/layout/MarketsPanelSlot.tsx` |
| Create | `src/components/markets/SparklineChart.tsx` |
| Create | `server/__tests__/adapters/yahoo-finance.test.ts` |
| Create | `server/__tests__/routes/markets.test.ts` |
| Create | `src/__tests__/marketStore.test.ts` |
| Create | `src/__tests__/useMarketPolling.test.ts` |
| Create | `src/__tests__/MarketsPanel.test.tsx` |
| Modify | `server/index.ts` — register `/api/markets` |
| Modify | `src/components/layout/AppShell.tsx` — wire useMarketPolling + MarketsPanelSlot |

### Phase 19: Search, Filter & UI Cleanup
| Action | File |
|--------|------|
| Create | `src/components/layout/SearchBarSlot.tsx` |
| Create | `src/stores/searchStore.ts` |
| Create | `src/__tests__/searchStore.test.ts` |
| Create | `src/__tests__/SearchBar.test.tsx` |
| Modify | `src/components/layout/AppShell.tsx` — mount SearchBarSlot |
| Modify | `src/stores/filterStore.ts` — remove `Min` from `STEP_MS`, add `clearAll` |
| Modify | `src/components/filter/DateRangeFilter.tsx` — remove Min button |
| Modify | `src/components/layout/FilterPanelSlot.tsx` — grouped sections + Reset All |
| Modify | `src/components/layout/LayerTogglesSlot.tsx` — scrollable/max-height |
| Modify | `src/components/layout/DetailPanelSlot.tsx` — layout audit |

### Phase 20: Production Review & Deploy Sync
No new files — verification + git only.

---

## Phase 15: Key Sites Overlay

---

### Task 15-1: Add SiteEntity to shared types

**Files:**
- Modify: `server/types.ts`
- Modify: `src/types/entities.ts`

- [ ] **Step 1: Write failing type test**

```typescript
// @vitest-environment node
// server/__tests__/types.test.ts  (add to existing file)
import type { SiteEntity, EntityType } from '../types.js';

it('SiteEntity has type site', () => {
  const e: SiteEntity = {
    id: '1', type: 'site', lat: 32, lng: 48, timestamp: 0, label: 'Natanz',
    data: { siteType: 'nuclear', osmId: 'node/123', osmUrl: 'https://osm.org/node/123' },
  };
  expect(e.type).toBe('site');
});

it('EntityType includes site', () => {
  const t: EntityType = 'site';
  expect(t).toBe('site');
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run server/__tests__/types.test.ts
```
Expected: FAIL — `'site'` not assignable to `EntityType`

- [ ] **Step 3: Add SiteEntity to server/types.ts**

Add after `ShipEntity`:

```typescript
export type SiteType = 'nuclear' | 'oil_refinery' | 'naval_base' | 'airbase' | 'dam' | 'port';

export interface SiteEntity extends MapEntityBase {
  type: 'site';
  data: {
    siteType: SiteType;
    osmId: string;
    osmUrl: string;
    operator?: string;
  };
}
```

Update `EntityType`:
```typescript
export type EntityType = 'flight' | 'ship' | 'site' | ConflictEventType;
```

Update `MapEntity` union:
```typescript
export type MapEntity = FlightEntity | ShipEntity | SiteEntity | ConflictEventEntity;
```

- [ ] **Step 4: Re-export from src/types/entities.ts**

Add to the existing re-export block:
```typescript
export type { SiteEntity, SiteType } from '../../server/types.js';
```

- [ ] **Step 5: Run tests to verify they pass**

```
npx vitest run server/__tests__/types.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/types.ts src/types/entities.ts server/__tests__/types.test.ts
git commit -m "feat(15): add SiteEntity discriminated union type"
```

---

### Task 15-2: Overpass adapter

**Files:**
- Create: `server/adapters/overpass.ts`
- Create: `server/__tests__/adapters/overpass.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// @vitest-environment node
// server/__tests__/adapters/overpass.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSites } from '../../adapters/overpass.js';

const mockResponse = {
  elements: [
    { type: 'node', id: 1, lat: 33.7, lon: 51.4, tags: { 'military': 'naval_base', name: 'Bandar Abbas Naval Base' } },
    { type: 'node', id: 2, lat: 32.3, lon: 53.9, tags: { 'man_made': 'nuclear_facility', name: 'Natanz' } },
    { type: 'node', id: 3, lat: 32.1, lon: 48.5, tags: { 'amenity': 'cafe', name: 'Some Cafe' } }, // should be filtered
    { type: 'node', id: 4, lat: 32.0, lon: 49.0, tags: { 'military': 'naval_base' } }, // no name — should be filtered
  ]
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockResponse),
  }));
});

describe('fetchSites', () => {
  it('returns SiteEntity array with correct fields', async () => {
    const sites = await fetchSites();
    expect(sites.length).toBe(2); // cafe and unnamed filtered out
    expect(sites[0].type).toBe('site');
    expect(sites[0].data.siteType).toBe('naval_base');
    expect(sites[0].label).toBe('Bandar Abbas Naval Base');
    expect(sites[0].data.osmUrl).toContain('node/1');
  });

  it('assigns nuclear siteType for nuclear_facility tag', async () => {
    const sites = await fetchSites();
    const natanz = sites.find(s => s.label === 'Natanz');
    expect(natanz?.data.siteType).toBe('nuclear');
  });

  it('filters out unnamed sites', async () => {
    const sites = await fetchSites();
    expect(sites.every(s => s.label.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
npx vitest run server/__tests__/adapters/overpass.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement overpass.ts**

```typescript
// server/adapters/overpass.ts
import type { SiteEntity, SiteType } from '../types.js';
import { IRAN_BBOX } from '../constants.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Classify OSM tags → SiteType. Returns null for unrecognized tags. */
function classifyTags(tags: Record<string, string>): SiteType | null {
  if (tags['military'] === 'nuclear_hazard' || tags['man_made'] === 'nuclear_facility') return 'nuclear';
  if (tags['military'] === 'naval_base') return 'naval_base';
  if (tags['military'] === 'airfield' || tags['aeroway'] === 'military') return 'airbase';
  if (tags['man_made'] === 'petroleum_well' || tags['industrial'] === 'oil_refinery') return 'oil_refinery';
  if (tags['waterway'] === 'dam') return 'dam';
  if (tags['harbour'] === 'yes') return 'port';
  return null;
}

/** Build Overpass QL query for whitelisted site types within IRAN_BBOX */
function buildQuery(): string {
  const { south, north, west, east } = IRAN_BBOX;
  const bbox = `${south},${west},${north},${east}`;
  return `
    [out:json][timeout:30];
    (
      node["military"="nuclear_hazard"](${bbox});
      node["man_made"="nuclear_facility"](${bbox});
      node["military"="naval_base"](${bbox});
      node["military"="airfield"](${bbox});
      node["aeroway"="military"](${bbox});
      node["man_made"="petroleum_well"]["name"](${bbox});
      node["industrial"="oil_refinery"](${bbox});
      node["waterway"="dam"]["name"](${bbox});
      node["harbour"="yes"]["name"](${bbox});
    );
    out body;
  `.trim();
}

interface OverpassElement {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export async function fetchSites(): Promise<SiteEntity[]> {
  const query = buildQuery();
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);

  const json = await res.json() as { elements: OverpassElement[] };

  return json.elements
    .filter((el): el is OverpassElement & { lat: number; lon: number } =>
      el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number'
    )
    .flatMap((el): SiteEntity[] => {
      const siteType = classifyTags(el.tags);
      const name = el.tags['name'];
      if (!siteType || !name) return [];
      return [{
        id: `site-${el.id}`,
        type: 'site',
        lat: el.lat,
        lng: el.lon,
        timestamp: 0,
        label: name,
        data: {
          siteType,
          osmId: `node/${el.id}`,
          osmUrl: `https://www.openstreetmap.org/node/${el.id}`,
          operator: el.tags['operator'],
        },
      }];
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run server/__tests__/adapters/overpass.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/adapters/overpass.ts server/__tests__/adapters/overpass.test.ts
git commit -m "feat(15): add Overpass adapter with whitelist tag filter"
```

---

### Task 15-3: /api/sites route

**Files:**
- Create: `server/routes/sites.ts`
- Create: `server/__tests__/routes/sites.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Write failing route test**

```typescript
// @vitest-environment node
// server/__tests__/routes/sites.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../index.js';

vi.mock('../../adapters/overpass.js', () => ({
  fetchSites: vi.fn().mockResolvedValue([
    { id: 'site-1', type: 'site', lat: 32, lng: 48, timestamp: 0, label: 'Natanz',
      data: { siteType: 'nuclear', osmId: 'node/1', osmUrl: 'https://osm.org/node/1' } }
  ]),
}));

vi.mock('../../cache/redis.js', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  redis: { get: vi.fn(), set: vi.fn() },
}));

describe('GET /api/sites', () => {
  it('returns 200 with site array', async () => {
    const app = createApp();
    const res = await request(app).get('/api/sites');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].type).toBe('site');
    expect(res.body.stale).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
npx vitest run server/__tests__/routes/sites.test.ts
```
Expected: FAIL — route not registered

- [ ] **Step 3: Add `sites` to CACHE_TTL in server/constants.ts**

Open `server/constants.ts` and add `sites: 86_400_000` to the `CACHE_TTL` object alongside the existing `flights`, `ships`, and `events` entries. This must happen before Step 4 so TypeScript strict mode accepts the reference.

- [ ] **Step 4: Implement server/routes/sites.ts**

```typescript
import { Router } from 'express';
import { cacheGet, cacheSet } from '../cache/redis.js';
import { fetchSites } from '../adapters/overpass.js';
import { CACHE_TTL } from '../constants.js';
import type { SiteEntity } from '../types.js';

const SITES_KEY = 'sites:osm';
const LOGICAL_TTL_MS = CACHE_TTL.sites; // 24h — defined in constants.ts
const REDIS_TTL_SEC = 90_000; // 25h hard TTL

export const sitesRouter = Router();

sitesRouter.get('/', async (_req, res) => {
  const cached = await cacheGet<SiteEntity[]>(SITES_KEY, LOGICAL_TTL_MS);
  if (cached && !cached.stale) return res.json(cached);

  try {
    const sites = await fetchSites();
    await cacheSet(SITES_KEY, sites, REDIS_TTL_SEC);
    res.json({ data: sites, stale: false, lastFresh: Date.now() });
  } catch (err) {
    console.error('[sites] upstream error:', (err as Error).message);
    if (cached) return res.json({ data: cached.data, stale: true, lastFresh: cached.lastFresh });
    throw err;
  }
});
```

- [ ] **Step 5: Register route in server/index.ts**

```typescript
import { sitesRouter } from './routes/sites.js';
// in createApp():
app.use('/api/sites', sitesRouter);
```

- [ ] **Step 6: Run tests to verify they pass**

```
npx vitest run server/__tests__/routes/sites.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/routes/sites.ts server/__tests__/routes/sites.test.ts server/index.ts server/constants.ts
git commit -m "feat(15): add /api/sites route with 24h Redis cache"
```



---

### Task 15-4: siteStore + useSitePolling

**Files:**
- Create: `src/stores/siteStore.ts`
- Create: `src/hooks/useSitePolling.ts`
- Create: `src/__tests__/siteStore.test.ts`
- Create: `src/__tests__/useSitePolling.test.ts`

- [ ] **Step 1: Write siteStore test**

```typescript
// src/__tests__/siteStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useSiteStore } from '@/stores/siteStore';
import type { SiteEntity } from '@/types/entities';

const SITE: SiteEntity = {
  id: 'site-1', type: 'site', lat: 32, lng: 48, timestamp: 0, label: 'Natanz',
  data: { siteType: 'nuclear', osmId: 'node/1', osmUrl: 'https://osm.org/node/1' },
};

beforeEach(() => useSiteStore.setState({ sites: [], connectionStatus: 'loading', lastFetchAt: null }));

describe('useSiteStore', () => {
  it('setSiteData populates sites', () => {
    useSiteStore.getState().setSiteData({ data: [SITE], stale: false, lastFresh: 1000 });
    expect(useSiteStore.getState().sites).toHaveLength(1);
    expect(useSiteStore.getState().connectionStatus).toBe('connected');
  });

  it('setSiteData marks stale correctly', () => {
    useSiteStore.getState().setSiteData({ data: [SITE], stale: true, lastFresh: 1000 });
    expect(useSiteStore.getState().connectionStatus).toBe('stale');
  });

  it('setError sets error status', () => {
    useSiteStore.getState().setError();
    expect(useSiteStore.getState().connectionStatus).toBe('error');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
npx vitest run src/__tests__/siteStore.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement siteStore.ts**

```typescript
// src/stores/siteStore.ts
import { create } from 'zustand';
import type { SiteEntity, CacheResponse } from '@/types/entities';
import type { ConnectionStatus } from '@/stores/eventStore';

interface SiteState {
  sites: SiteEntity[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  setSiteData: (response: CacheResponse<SiteEntity[]>) => void;
  setError: () => void;
  setLoading: () => void;
}

export const useSiteStore = create<SiteState>()((set) => ({
  sites: [],
  connectionStatus: 'loading',
  lastFetchAt: null,
  setSiteData: (response) => set({
    sites: response.data,
    connectionStatus: response.stale ? 'stale' : 'connected',
    lastFetchAt: Date.now(),
  }),
  setError: () => set({ connectionStatus: 'error' }),
  setLoading: () => set({ connectionStatus: 'loading' }),
}));
```

- [ ] **Step 4: Implement useSitePolling.ts**

```typescript
// src/hooks/useSitePolling.ts
import { useEffect, useRef } from 'react';
import { useSiteStore } from '@/stores/siteStore';
import type { SiteEntity, CacheResponse } from '@/types/entities';

export const SITE_POLL_INTERVAL = 86_400_000; // 24h

export function useSitePolling(): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchAtRef = useRef<number | null>(null);

  const setSiteData = useSiteStore((s) => s.setSiteData);
  const setError = useSiteStore((s) => s.setError);
  const setLoading = useSiteStore((s) => s.setLoading);

  useEffect(() => {
    let cancelled = false;

    const fetchSites = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/sites');
        if (cancelled) return;
        const data: CacheResponse<SiteEntity[]> = await res.json();
        lastFetchAtRef.current = Date.now();
        setSiteData(data);
      } catch {
        if (!cancelled) setError();
      }
    };

    const schedulePoll = (): void => {
      if (cancelled) return;
      timeoutRef.current = setTimeout(async () => {
        await fetchSites();
        schedulePoll();
      }, SITE_POLL_INTERVAL);
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else {
        // Only re-fetch on resume if data is stale (>24h old)
        const isStale = lastFetchAtRef.current === null ||
          Date.now() - lastFetchAtRef.current > SITE_POLL_INTERVAL;
        if (isStale) fetchSites().then(schedulePoll);
        else schedulePoll();
      }
    };

    setLoading();
    fetchSites().then(schedulePoll);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [setSiteData, setError, setLoading]);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```
npx vitest run src/__tests__/siteStore.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores/siteStore.ts src/hooks/useSitePolling.ts src/__tests__/siteStore.test.ts
git commit -m "feat(15): add siteStore and useSitePolling hook"
```

---

### Task 15-5: Site toggle state in uiStore + LayerToggles

**Files:**
- Modify: `src/types/ui.ts`
- Modify: `src/stores/uiStore.ts`
- Modify: `src/components/layout/LayerTogglesSlot.tsx`

- [ ] **Step 1: Add site toggle fields to LayerToggles in ui.ts**

Add to `LayerToggles` interface (after `pulseEnabled`):
```typescript
showSites: boolean;
showSitesNuclear: boolean;
showSitesOil: boolean;
showSitesNaval: boolean;
showSitesAirbase: boolean;
showSitesDam: boolean;
showSitesPort: boolean;
```

Add matching defaults to `LAYER_TOGGLE_DEFAULTS`:
```typescript
showSites: true,
showSitesNuclear: true,
showSitesOil: true,
showSitesNaval: true,
showSitesAirbase: true,
showSitesDam: true,
showSitesPort: true,
```

- [ ] **Step 2: Add site toggle state and actions to UIState in uiStore.ts**

Follow the exact pattern of existing toggles. Add 7 boolean fields + 7 toggle actions. Each `toggle*` action calls `persistToggles(getToggles(get()))` after setting. Add the fields to `getToggles()`.

- [ ] **Step 3: Add "Key Sites" toggle section to LayerTogglesSlot.tsx**

Add after the Targeted row:
```tsx
<ToggleRow color="#6b7280" label="Key Sites" active={showSites} onToggle={toggleSites} />
<ToggleRow color="#ef4444" label="Nuclear" active={showSitesNuclear} onToggle={toggleSitesNuclear} indent disabled={!showSites} />
<ToggleRow color="#f59e0b" label="Oil & Refinery" active={showSitesOil} onToggle={toggleSitesOil} indent disabled={!showSites} />
<ToggleRow color="#3b82f6" label="Naval Base" active={showSitesNaval} onToggle={toggleSitesNaval} indent disabled={!showSites} />
<ToggleRow color="#8b5cf6" label="Airbase" active={showSitesAirbase} onToggle={toggleSitesAirbase} indent disabled={!showSites} />
<ToggleRow color="#06b6d4" label="Dam" active={showSitesDam} onToggle={toggleSitesDam} indent disabled={!showSites} />
<ToggleRow color="#10b981" label="Port" active={showSitesPort} onToggle={toggleSitesPort} indent disabled={!showSites} />
```

- [ ] **Step 4: Run tests to verify no regressions**

```
npx vitest run src/__tests__/LayerToggles.test.tsx src/__tests__/uiStore.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/ui.ts src/stores/uiStore.ts src/components/layout/LayerTogglesSlot.tsx
git commit -m "feat(15): add site layer toggles to uiStore and LayerTogglesSlot"
```

---

### Task 15-6: SiteDetail component + wire into detail panel

**Files:**
- Create: `src/components/detail/SiteDetail.tsx`
- Modify: `src/components/layout/DetailPanelSlot.tsx`
- Modify: `src/hooks/useSelectedEntity.ts`

- [ ] **Step 1: Implement SiteDetail.tsx**

```tsx
// src/components/detail/SiteDetail.tsx
import type { SiteEntity } from '@/types/entities';
import { EVENT_TYPE_LABELS } from '@/types/ui';

const SITE_TYPE_LABELS: Record<string, string> = {
  nuclear: 'Nuclear Facility',
  oil_refinery: 'Oil & Refinery',
  naval_base: 'Naval Base',
  airbase: 'Airbase',
  dam: 'Dam',
  port: 'Port',
};

export function SiteDetail({ entity }: { entity: SiteEntity }) {
  const { data } = entity;
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {SITE_TYPE_LABELS[data.siteType] ?? data.siteType}
      </div>
      <div className="text-sm font-semibold text-text-primary">{entity.label}</div>
      <div className="flex flex-col gap-1 text-xs text-text-secondary">
        <span>{entity.lat.toFixed(4)}°N, {entity.lng.toFixed(4)}°E</span>
        {data.operator && <span>Operator: {data.operator}</span>}
      </div>
      <a
        href={data.osmUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-accent-blue hover:underline"
      >
        View on OpenStreetMap
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Update useSelectedEntity to search siteStore**

```typescript
// Add import at top
import { useSiteStore } from '@/stores/siteStore';

// Add store subscription inside useSelectedEntity() alongside the other selectors:
const sites = useSiteStore((s) => s.sites);  // must be here, not inside useMemo

// Update the search inside useMemo:
const found =
  flights.find((f) => f.id === selectedId) ??
  ships.find((s) => s.id === selectedId) ??
  events.find((e) => e.id === selectedId) ??
  sites.find((s) => s.id === selectedId) ??  // <-- add
  null;

// Add sites to useMemo deps array (line 58): [selectedId, flights, ships, events, sites]
```

- [ ] **Step 3: Add SiteDetail case to DetailPanelSlot.tsx**

Find where `FlightDetail`, `ShipDetail`, `EventDetail` are rendered (the entity.type switch/conditional) and add:
```tsx
import { SiteDetail } from '@/components/detail/SiteDetail';
// in the render switch:
{entity.type === 'site' && <SiteDetail entity={entity} />}
```

- [ ] **Step 4: Run tests**

```
npx vitest run src/__tests__/useSelectedEntity.test.ts src/__tests__/DetailPanel.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/SiteDetail.tsx src/components/layout/DetailPanelSlot.tsx src/hooks/useSelectedEntity.ts
git commit -m "feat(15): add SiteDetail panel and wire useSelectedEntity for sites"
```

---

### Task 15-7: Site IconLayer in BaseMap + shrink event icons

**Files:**
- Modify: `src/components/map/BaseMap.tsx`

- [ ] **Step 1: Shrink event icon sizing**

Find all event `IconLayer` usages in BaseMap.tsx (currently `sizeScale: 5000, sizeMinPixels: 16, sizeMaxPixels: 120`). Change to:
```typescript
sizeScale: 3500,
sizeMinPixels: 12,
sizeMaxPixels: 80,
```

- [ ] **Step 2: Add site IconLayer**

Following the exact pattern of the existing event `IconLayer`, add a new layer using `useSiteStore`. Map `siteType` to icon name (use existing icon system or add site icons). Apply toggle visibility via `showSites` + per-type sub-toggles.

Sites that should be hidden when their sub-toggle is off should filter the data array:
```typescript
const visibleSites = sites.filter(s => {
  if (!showSites) return false;
  const { siteType } = s.data;
  if (siteType === 'nuclear') return showSitesNuclear;
  if (siteType === 'oil_refinery') return showSitesOil;
  if (siteType === 'naval_base') return showSitesNaval;
  if (siteType === 'airbase') return showSitesAirbase;
  if (siteType === 'dam') return showSitesDam;
  if (siteType === 'port') return showSitesPort;
  return true;
});
```

Same sizing: `sizeScale: 3500, sizeMinPixels: 12, sizeMaxPixels: 80`

- [ ] **Step 3: Wire useSitePolling in AppShell.tsx**

```typescript
import { useSitePolling } from '@/hooks/useSitePolling';
// inside AppShell():
useSitePolling();
```

- [ ] **Step 4: Run full test suite**

```
npx vitest run
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/map/BaseMap.tsx src/components/layout/AppShell.tsx
git commit -m "feat(15): add site IconLayer, shrink event icons, wire useSitePolling"
```

---

## Phase 16: News Feed

---

### Task 16-1: News adapter

**Files:**
- Create: `server/adapters/news.ts`
- Create: `server/__tests__/adapters/news.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// @vitest-environment node
// server/__tests__/adapters/news.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchNews, type NewsItem } from '../../adapters/news.js';

const gdeltResponse = {
  articles: [
    { url: 'https://a.com/1', title: 'Iran airstrike hits site', seendate: '20260319T120000Z', domain: 'a.com' },
    { url: 'https://b.com/2', title: 'Sports update', seendate: '20260319T110000Z', domain: 'b.com' }, // filtered
  ]
};

const bbcRss = `<?xml version="1.0"?>
<rss><channel>
  <item><title>Israel strikes Iran</title><link>https://bbc.com/1</link><pubDate>Thu, 19 Mar 2026 12:00:00 GMT</pubDate></item>
</channel></rss>`;

const ajRss = `<?xml version="1.0"?>
<rss><channel>
  <item><title>IRGC announces military exercises</title><link>https://aljazeera.com/1</link><pubDate>Thu, 19 Mar 2026 11:00:00 GMT</pubDate></item>
  <item><title>Football highlights</title><link>https://aljazeera.com/2</link><pubDate>Thu, 19 Mar 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

beforeEach(() => {
  let call = 0;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
    call++;
    if (call === 1) return Promise.resolve({ ok: true, json: () => Promise.resolve(gdeltResponse) });
    if (call === 2) return Promise.resolve({ ok: true, text: () => Promise.resolve(bbcRss) });
    return Promise.resolve({ ok: true, text: () => Promise.resolve(ajRss) });
  }));
});

describe('fetchNews', () => {
  it('returns deduped, noise-filtered items sorted by date', async () => {
    const items = await fetchNews();
    expect(items.length).toBe(3); // sports + football filtered; 3 conflict items remain
    expect(items.every(i => i.url && i.title && i.publishedAt)).toBe(true);
  });

  it('deduplicates by url', async () => {
    const items = await fetchNews();
    const urls = items.map(i => i.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('assigns correct source fields', async () => {
    const items = await fetchNews();
    expect(items.some(i => i.source === 'gdelt')).toBe(true);
    expect(items.some(i => i.source === 'bbc')).toBe(true);
    expect(items.some(i => i.source === 'aljazeera')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
npx vitest run server/__tests__/adapters/news.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement news.ts**

```typescript
// server/adapters/news.ts
import crypto from 'node:crypto';

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: 'gdelt' | 'bbc' | 'aljazeera';
  publishedAt: number;
  imageUrl?: string;
  description?: string;
}

const CONFLICT_KEYWORDS = [
  'iran', 'israel', 'iraq', 'syria', 'gaza', 'lebanon',
  'hezbollah', 'irgc', 'airstrike', 'missile', 'strike',
  'attack', 'military', 'conflict',
];

function passesNoiseFilter(title: string, description = ''): boolean {
  const text = `${title} ${description}`.toLowerCase();
  return CONFLICT_KEYWORDS.some(k => text.includes(k));
}

function urlId(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
}

async function fetchGdelt(): Promise<NewsItem[]> {
  const query = encodeURIComponent('Iran OR "Middle East" OR Iraq OR Israel theme:MILITARY_STRIKE OR theme:TERROR');
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=50&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json() as { articles?: Array<{ url: string; title: string; seendate: string; socialimage?: string }> };
  return (json.articles ?? []).flatMap((a): NewsItem[] => {
    if (!passesNoiseFilter(a.title)) return [];
    const ms = Date.parse(a.seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z'));
    return [{ id: urlId(a.url), title: a.title, url: a.url, source: 'gdelt', publishedAt: ms, imageUrl: a.socialimage }];
  });
}

async function fetchRss(feedUrl: string, source: 'bbc' | 'aljazeera'): Promise<NewsItem[]> {
  const res = await fetch(feedUrl);
  if (!res.ok) return [];
  const text = await res.text();
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(text)) !== null) {
    const block = match[1];
    const title = /<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/s.exec(block);
    const link = /<link>(.*?)<\/link>/.exec(block);
    const pubDate = /<pubDate>(.*?)<\/pubDate>/.exec(block);
    const desc = /<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/s.exec(block);
    const t = title?.[1] ?? title?.[2] ?? '';
    const d = desc?.[1] ?? desc?.[2] ?? '';
    const u = link?.[1]?.trim() ?? '';
    if (!t || !u) continue;
    if (!passesNoiseFilter(t, d)) continue;
    items.push({
      id: urlId(u),
      title: t.trim(),
      url: u,
      source,
      publishedAt: pubDate ? Date.parse(pubDate[1]) : Date.now(),
      description: d.trim() || undefined,
    });
  }
  return items;
}

export async function fetchNews(): Promise<NewsItem[]> {
  const [gdelt, bbc, aj] = await Promise.allSettled([
    fetchGdelt(),
    fetchRss('https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', 'bbc'),
    fetchRss('https://www.aljazeera.com/xml/rss/all.xml', 'aljazeera'),
  ]);

  const all: NewsItem[] = [
    ...(gdelt.status === 'fulfilled' ? gdelt.value : []),
    ...(bbc.status === 'fulfilled' ? bbc.value : []),
    ...(aj.status === 'fulfilled' ? aj.value : []),
  ];

  // Deduplicate by URL id, keep first occurrence
  const seen = new Set<string>();
  return all
    .filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; })
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 50);
}
```

- [ ] **Step 4: Run tests**

```
npx vitest run server/__tests__/adapters/news.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/adapters/news.ts server/__tests__/adapters/news.test.ts
git commit -m "feat(16): add news adapter with GDELT DOC + BBC + AJ RSS sources"
```

---

### Task 16-2: /api/news route + newsStore + polling

**Files:**
- Create: `server/routes/news.ts`
- Create: `src/stores/newsStore.ts`
- Create: `src/hooks/useNewsPolling.ts`

- [ ] **Step 1: Implement server/routes/news.ts**

Follow the exact pattern of `server/routes/events.ts` (cache-first, stale fallback, error rethrow). Use:
- Import: `fetchNews` from `../adapters/news.js`
- Cache key: `'news:feed'`
- Logical TTL: `900_000` (15 min)
- Redis TTL: `10_800` (3h hard TTL)
- Response type: `NewsItem[]`

- [ ] **Step 2: Register in server/index.ts**

```typescript
import { newsRouter } from './routes/news.js';
app.use('/api/news', newsRouter);
```

- [ ] **Step 3: Implement newsStore.ts**

Exact same pattern as `eventStore.ts`. Store shape:
```typescript
interface NewsState {
  items: NewsItem[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  setNewsData: (response: CacheResponse<NewsItem[]>) => void;
  setError: () => void;
  setLoading: () => void;
}
```
Import `NewsItem` from `@/types/news` — but since it's a server-only type, create a thin re-export:

Create `src/types/news.ts`:
```typescript
export type { NewsItem } from '../../server/adapters/news.js';
```

- [ ] **Step 4: Implement useNewsPolling.ts**

Follow `useEventPolling.ts` exactly. Poll interval: `900_000` (15 min). Endpoint: `/api/news`. Tab visibility: always re-fetch on resume (same as events).

- [ ] **Step 5: Wire into AppShell.tsx**

```typescript
import { useNewsPolling } from '@/hooks/useNewsPolling';
// inside AppShell():
useNewsPolling();
```

- [ ] **Step 6: Run all tests**

```
npx vitest run
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/routes/news.ts server/index.ts src/stores/newsStore.ts src/hooks/useNewsPolling.ts src/types/news.ts src/components/layout/AppShell.tsx
git commit -m "feat(16): add /api/news route, newsStore, useNewsPolling"
```

---

## Phase 17: Notification Center

---

### Task 17-1: /api/notifications route with severity scoring

**Files:**
- Create: `server/routes/notifications.ts`
- Create: `server/__tests__/routes/notifications.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// @vitest-environment node
// server/__tests__/routes/notifications.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Declare mock fn at module scope so it can be reassigned per test
const mockCacheGet = vi.fn();

vi.mock('../../cache/redis.js', () => ({
  cacheGet: mockCacheGet,
  cacheSet: vi.fn(),
  redis: { get: vi.fn(), set: vi.fn() },
}));

// Import after mock is registered
const { createApp } = await import('../../index.js');

const BASE_EVENTS = [
  { id: 'e1', type: 'airstrike', lat: 32, lng: 48, timestamp: Date.now() - 3_600_000, label: 'Baghdad',
    data: { goldsteinScale: -8, eventType: 'Airstrike', subEventType: 'CAMEO 190', fatalities: 0, actor1: 'ISRAEL', actor2: 'IRAN', notes: '', source: '', locationName: 'Baghdad', cameoCode: '190' }},
  { id: 'e2', type: 'assault', lat: 33, lng: 44, timestamp: Date.now() - 7_200_000, label: 'Tehran',
    data: { goldsteinScale: -4, eventType: 'Assault', subEventType: 'CAMEO 180', fatalities: 0, actor1: 'IRAN', actor2: 'ISRAEL', notes: '', source: '', locationName: 'Tehran', cameoCode: '180' }},
];

beforeEach(() => {
  mockCacheGet.mockImplementation((key: string) => {
    if (key === 'events:gdelt') return Promise.resolve({ data: BASE_EVENTS, stale: false, lastFresh: Date.now() });
    if (key === 'news:feed') return Promise.resolve({ data: [], stale: false, lastFresh: Date.now() });
    return Promise.resolve(null);
  });
});

describe('GET /api/notifications', () => {
  it('returns 200 with scored, sorted notifications', async () => {
    const app = createApp();
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // airstrike (weight 10) should score higher than assault (weight 3)
    expect(res.body[0].id).toBe('e1');
    expect(res.body[0].score).toBeGreaterThan(res.body[1].score);
  });

  it('drops events older than 24h', async () => {
    mockCacheGet.mockImplementation((key: string) => {
      if (key === 'events:gdelt') return Promise.resolve({ data: [
        { ...BASE_EVENTS[0], timestamp: Date.now() - 86_400_001 },
      ], stale: false, lastFresh: Date.now() });
      return Promise.resolve({ data: [], stale: false, lastFresh: Date.now() });
    });
    const app = createApp();
    const res = await request(app).get('/api/notifications');
    expect(res.body).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
npx vitest run server/__tests__/routes/notifications.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement server/routes/notifications.ts**

```typescript
import { Router } from 'express';
import { cacheGet } from '../cache/redis.js';
import type { ConflictEventEntity } from '../types.js';
import type { NewsItem } from '../adapters/news.js';

const TYPE_WEIGHTS: Record<string, number> = {
  airstrike: 10, wmd: 10, shelling: 7, bombing: 7,
  ground_combat: 6, mass_violence: 6, assassination: 5,
  blockade: 4, abduction: 4, assault: 3, ceasefire_violation: 3,
};

function recencyDecay(ageMs: number): number {
  const h = ageMs / 3_600_000;
  if (h <= 2) return 1.0;
  if (h <= 6) return 0.7;
  if (h <= 12) return 0.4;
  if (h <= 24) return 0.2;
  return 0;
}

function scoreEvent(event: ConflictEventEntity & { data: { numMentions?: number; numSources?: number } }): number {
  const typeWeight = TYPE_WEIGHTS[event.type] ?? 1;
  const mentions = (event.data as Record<string, unknown>)['numMentions'] as number ?? 1;
  const sources = (event.data as Record<string, unknown>)['numSources'] as number ?? 1;
  const age = Date.now() - event.timestamp;
  const decay = recencyDecay(age);
  if (decay === 0) return 0;
  return typeWeight * Math.log1p(mentions) * Math.log1p(sources) * decay;
}

function matchNews(event: ConflictEventEntity, newsItems: NewsItem[]): NewsItem[] {
  const eventTime = event.timestamp;
  const window = 2 * 3_600_000; // ±2h
  const locationKeywords = event.data.locationName.toLowerCase().split(/[\s,]+/);
  return newsItems
    .filter(n => Math.abs(n.publishedAt - eventTime) <= window)
    .filter(n => {
      const text = `${n.title} ${n.description ?? ''}`.toLowerCase();
      return locationKeywords.some(k => k.length > 3 && text.includes(k));
    })
    .slice(0, 3);
}

export const notificationsRouter = Router();

notificationsRouter.get('/', async (_req, res) => {
  const [eventsCached, newsCached] = await Promise.all([
    cacheGet<ConflictEventEntity[]>('events:gdelt', 86_400_000),
    cacheGet<NewsItem[]>('news:feed', 900_000),
  ]);

  const events = eventsCached?.data ?? [];
  const news = newsCached?.data ?? [];

  const scored = events
    .map(event => ({ ...event, score: scoreEvent(event as ConflictEventEntity & { data: { numMentions?: number; numSources?: number } }) }))
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(event => ({ ...event, matchedNews: matchNews(event, news) }));

  res.json(scored);
});
```

- [ ] **Step 4: Register in server/index.ts**

```typescript
import { notificationsRouter } from './routes/notifications.js';
app.use('/api/notifications', notificationsRouter);
```

Note: The `ConflictEventEntity.data` type doesn't currently include `numMentions`/`numSources` — the scoring falls back to 1 for both. This is intentional; GDELT raw data has these fields but they aren't in the normalized type yet. Scoring still works via type weights and recency.

- [ ] **Step 5: Run tests**

```
npx vitest run server/__tests__/routes/notifications.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/routes/notifications.ts server/__tests__/routes/notifications.test.ts server/index.ts
git commit -m "feat(17): add /api/notifications with severity scoring and news matching"
```

---

### Task 17-2: notificationStore + 24h event default

**Files:**
- Create: `src/stores/notificationStore.ts`
- Modify: `src/stores/filterStore.ts`
- Modify: `src/hooks/useEntityLayers.ts` (or wherever events are filtered for the map)

- [ ] **Step 1: Write notificationStore test**

```typescript
// src/__tests__/notificationStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStore } from '@/stores/notificationStore';

beforeEach(() => useNotificationStore.setState({
  notifications: [], proximityAlerts: [], unreadCount: 0,
  connectionStatus: 'loading', lastFetchAt: null,
}));

describe('useNotificationStore', () => {
  it('setNotifications populates and resets unread count', () => {
    useNotificationStore.getState().setNotifications([{ id: '1' } as never]);
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it('markAllRead sets unreadCount to 0', () => {
    useNotificationStore.setState({ unreadCount: 5 });
    useNotificationStore.getState().markAllRead();
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('clearAll empties notifications and proximity alerts', () => {
    useNotificationStore.setState({ notifications: [{ id: '1' } as never], proximityAlerts: [{ id: '2' } as never] });
    useNotificationStore.getState().clearAll();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    expect(useNotificationStore.getState().proximityAlerts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement notificationStore.ts**

```typescript
// src/stores/notificationStore.ts
import { create } from 'zustand';
import type { ConnectionStatus } from '@/stores/eventStore';

export interface ScoredNotification {
  id: string;
  type: string;
  label: string;
  lat: number;
  lng: number;
  timestamp: number;
  score: number;
  matchedNews: Array<{ id: string; title: string; url: string; source: string; publishedAt: number }>;
  // full ConflictEventEntity.data fields omitted here — cast from API response
}

export interface ProximityAlert {
  id: string;        // `${siteId}-${entityId}`
  siteId: string;
  siteLabel: string;
  entityId: string;
  entityLabel: string;
  distanceKm: number;
  detectedAt: number;
}

interface NotificationState {
  notifications: ScoredNotification[];
  proximityAlerts: ProximityAlert[];
  unreadCount: number;
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  setNotifications: (items: ScoredNotification[]) => void;
  addProximityAlert: (alert: ProximityAlert) => void;
  markAllRead: () => void;
  clearAll: () => void;
  setError: () => void;
  setLoading: () => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  proximityAlerts: [],
  unreadCount: 0,
  connectionStatus: 'loading',
  lastFetchAt: null,

  setNotifications: (items) => set({
    notifications: items,
    unreadCount: items.length, // replace, not accumulate — server always returns current top-10
    connectionStatus: 'connected',
    lastFetchAt: Date.now(),
  }),

  addProximityAlert: (alert) => set((s) => {
    const exists = s.proximityAlerts.some(a => a.id === alert.id);
    if (exists) return {};
    return { proximityAlerts: [alert, ...s.proximityAlerts], unreadCount: s.unreadCount + 1 };
  }),

  markAllRead: () => set({ unreadCount: 0 }),
  clearAll: () => set({ notifications: [], proximityAlerts: [], unreadCount: 0 }),
  setError: () => set({ connectionStatus: 'error' }),
  setLoading: () => set({ connectionStatus: 'loading' }),
}));
```

- [ ] **Step 3: Add DEFAULT_EVENT_WINDOW_MS to filterStore.ts**

At the top of `src/stores/filterStore.ts`, add:
```typescript
/** 24h default event window — applied as soft lower bound when dateStart is null */
export const DEFAULT_EVENT_WINDOW_MS = 86_400_000;
```
This is a module-level constant only. No store fields change.

- [ ] **Step 4: Apply 24h window in event filtering**

Date filtering for events happens in `src/lib/filters.ts` inside `entityPassesFilters()`. Find the `dateStart` check for events and add the default window fallback:

```typescript
import { DEFAULT_EVENT_WINDOW_MS } from '@/stores/filterStore';

// Inside entityPassesFilters, where dateStart is checked for conflict events:
// Only apply default window to conflict events (not flights/ships which have separate custom-range behavior)
if (isConflictEventType(entity.type)) {
  const windowStart = filterState.dateStart ?? (Date.now() - DEFAULT_EVENT_WINDOW_MS);
  if (entity.timestamp < windowStart) return false;
}
```

This targets `src/lib/filters.ts` specifically, not `useEntityLayers.ts` (which doesn't date-filter).

- [ ] **Step 5: Run tests**

```
npx vitest run src/__tests__/notificationStore.test.ts src/__tests__/filters.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores/notificationStore.ts src/stores/filterStore.ts src/lib/filters.ts
git commit -m "feat(17): add notificationStore, DEFAULT_EVENT_WINDOW_MS 24h default"
```

---

### Task 17-3: Notification drawer UI

**Files:**
- Create: `src/components/notifications/NotificationCard.tsx`
- Create: `src/components/layout/NotificationDrawer.tsx`
- Modify: `src/stores/uiStore.ts`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/DetailPanelSlot.tsx`

- [ ] **Step 1: Add drawer state to uiStore**

Add to `UIState` interface and store:
```typescript
isNotificationDrawerOpen: boolean;
openNotificationDrawer: () => void;
closeNotificationDrawer: () => void;
```

- [ ] **Step 2: Implement NotificationCard.tsx**

```tsx
// src/components/notifications/NotificationCard.tsx
import type { ScoredNotification } from '@/stores/notificationStore';
import { EVENT_TYPE_LABELS } from '@/types/ui';

function SeverityBar({ score }: { score: number }) {
  const pct = Math.min(100, (score / 30) * 100); // 30 = rough max score
  return (
    <div className="h-1 w-full rounded-full bg-surface-raised">
      <div className="h-1 rounded-full bg-accent-red" style={{ width: `${pct}%` }} />
    </div>
  );
}

function RelativeTime({ ms }: { ms: number }) {
  const diff = Math.floor((Date.now() - ms) / 60_000);
  if (diff < 60) return <>{diff}m ago</>;
  return <>{Math.floor(diff / 60)}h ago</>;
}

export function NotificationCard({ notification }: { notification: ScoredNotification }) {
  const label = EVENT_TYPE_LABELS[notification.type] ?? notification.type;
  return (
    <div className="flex flex-col gap-2 rounded border border-surface-raised p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded bg-accent-red/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-red">
          {label}
        </span>
        <span className="text-[10px] text-text-muted">
          <RelativeTime ms={notification.timestamp} />
        </span>
      </div>
      <div className="text-xs text-text-secondary">{notification.label}</div>
      <SeverityBar score={notification.score} />
      {notification.matchedNews.length > 0 && (
        <div className="flex flex-col gap-1">
          {notification.matchedNews.map(n => (
            <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-accent-blue hover:underline line-clamp-2">
              {n.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement NotificationDrawer.tsx**

```tsx
// src/components/layout/NotificationDrawer.tsx
import { useEffect, useRef } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { NotificationCard } from '@/components/notifications/NotificationCard';

export function NotificationDrawer() {
  const isOpen = useUIStore(s => s.isNotificationDrawerOpen);
  const open = useUIStore(s => s.openNotificationDrawer);
  const close = useUIStore(s => s.closeNotificationDrawer);
  const notifications = useNotificationStore(s => s.notifications);
  const proximityAlerts = useNotificationStore(s => s.proximityAlerts);
  const unreadCount = useNotificationStore(s => s.unreadCount);
  const markAllRead = useNotificationStore(s => s.markAllRead);
  const clearAll = useNotificationStore(s => s.clearAll);
  const lastFetchAt = useNotificationStore(s => s.lastFetchAt);
  const lastUpdatedRef = useRef<HTMLSpanElement>(null);

  // Mark read on open
  useEffect(() => { if (isOpen) markAllRead(); }, [isOpen, markAllRead]);

  // Escape closes drawer (LIFO: closes notification drawer first)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) close(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  // Update CSS var for detail panel offset
  useEffect(() => {
    document.documentElement.style.setProperty('--notification-drawer-offset', isOpen ? '360px' : '0px');
  }, [isOpen]);

  // Relative "last updated" clock
  useEffect(() => {
    if (!lastFetchAt || !lastUpdatedRef.current) return;
    const update = () => {
      if (lastUpdatedRef.current) {
        const s = Math.floor((Date.now() - lastFetchAt) / 1000);
        lastUpdatedRef.current.textContent = `Last updated ${s}s ago`;
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastFetchAt]);

  return (
    <>
      {/* Bell icon */}
      <button
        onClick={() => isOpen ? close() : open()}
        className="absolute right-4 top-4 z-[var(--z-notification-bell)] flex h-9 w-9 items-center justify-center rounded bg-surface/80 backdrop-blur text-text-secondary hover:text-text-primary"
        aria-label="Toggle notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <path d="M12 22a2 2 0 002-2H10a2 2 0 002 2zm6-6V11a6 6 0 00-5-5.91V4a1 1 0 00-2 0v1.09A6 6 0 006 11v5l-2 2v1h16v-1l-2-2z"/>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-red text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      <div
        className={`absolute right-0 top-0 z-[var(--z-detail)] h-full w-[360px] flex flex-col bg-surface/95 backdrop-blur border-l border-surface-raised transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-surface-raised px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Notifications</span>
          <div className="flex gap-2">
            <button onClick={clearAll} className="text-[10px] text-text-muted hover:text-text-primary">Clear all</button>
            <button onClick={close} className="text-text-muted hover:text-text-primary">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {proximityAlerts.length > 0 && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Proximity Alerts</div>
              {proximityAlerts.map(a => (
                <div key={a.id} className="rounded border border-accent-yellow/30 bg-accent-yellow/10 p-2 text-xs text-text-secondary">
                  <strong>{a.entityLabel}</strong> within {a.distanceKm.toFixed(0)}km of <strong>{a.siteLabel}</strong>
                </div>
              ))}
            </>
          )}
          {notifications.length > 0 && (
            <>
              {proximityAlerts.length > 0 && (
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mt-2">Critical Events</div>
              )}
              {notifications.map(n => <NotificationCard key={n.id} notification={n} />)}
            </>
          )}
          {notifications.length === 0 && proximityAlerts.length === 0 && (
            <div className="text-xs text-text-muted text-center mt-8">No critical events in the last 24h</div>
          )}
        </div>

        <div className="border-t border-surface-raised px-4 py-2">
          <span ref={lastUpdatedRef} className="text-[10px] text-text-muted" />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Add polling hook for notifications**

Create `src/hooks/useNotificationPolling.ts` following `useEventPolling.ts` pattern. Poll every 60s. Endpoint: `/api/notifications`. On success: `setNotifications(data)`. Tab visibility: always re-fetch on resume.

- [ ] **Step 5: Mount in AppShell.tsx**

```tsx
import { NotificationDrawer } from '@/components/layout/NotificationDrawer';
import { useNotificationPolling } from '@/hooks/useNotificationPolling';
// inside AppShell():
useNotificationPolling();
// in JSX, add after DetailPanelSlot:
<NotificationDrawer />
```

- [ ] **Step 6: Apply --notification-drawer-offset to detail panel**

In `DetailPanelSlot.tsx`, find the `right-0` and `translate-x` positioning. Update the translate to account for the CSS var:
```tsx
style={{ transform: isOpen ? `translateX(calc(-1 * var(--notification-drawer-offset, 0px)))` : 'translateX(100%)' }}
```

- [ ] **Step 7: Add z-index var for bell icon**

In `app.css` or wherever CSS vars are defined, add:
```css
--z-notification-bell: 52; /* above controls, same level as detail panel toggle */
```

- [ ] **Step 8: Run tests**

```
npx vitest run src/__tests__/NotificationDrawer.test.tsx src/__tests__/notificationStore.test.ts
```
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/notifications/NotificationCard.tsx src/components/layout/NotificationDrawer.tsx src/stores/uiStore.ts src/hooks/useNotificationPolling.ts src/components/layout/AppShell.tsx src/components/layout/DetailPanelSlot.tsx
git commit -m "feat(17): add notification drawer with bell icon, cards, and panel coexistence"
```

---

## Phase 18: Oil Markets Tracker

---

### Task 18-1: Yahoo Finance adapter

**Files:**
- Create: `server/adapters/yahoo-finance.ts`
- Create: `server/__tests__/adapters/yahoo-finance.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// @vitest-environment node
// server/__tests__/adapters/yahoo-finance.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMarkets } from '../adapters/yahoo-finance.js';

const mockYahooResponse = (symbol: string, price: number, prevClose: number) => ({
  chart: {
    result: [{
      meta: { symbol, regularMarketPrice: price, previousClose: prevClose, marketState: 'REGULAR' },
      timestamp: [1710000000, 1710086400, 1710172800, 1710259200, 1710345600],
      indicators: { quote: [{ close: [prevClose - 1, prevClose, price - 0.5, price + 0.2, price] }] }
    }],
    error: null
  }
});

beforeEach(() => {
  let call = 0;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
    call++;
    const symbols = ['BZ=F', 'CL=F', 'XLE', 'USO', 'XOM'];
    const idx = (call - 1) % symbols.length;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockYahooResponse(symbols[idx], 85 + idx, 82 + idx)) });
  }));
});

describe('fetchMarkets', () => {
  it('returns 5 MarketQuote records', async () => {
    const quotes = await fetchMarkets();
    expect(quotes).toHaveLength(5);
  });

  it('computes changePct correctly', async () => {
    const quotes = await fetchMarkets();
    for (const q of quotes) {
      expect(typeof q.changePct).toBe('number');
      expect(q.price).toBeGreaterThan(0);
    }
  });

  it('includes 5-point sparkline array', async () => {
    const quotes = await fetchMarkets();
    for (const q of quotes) {
      expect(q.sparkline).toHaveLength(5);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
npx vitest run server/__tests__/adapters/yahoo-finance.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement yahoo-finance.ts**

```typescript
// server/adapters/yahoo-finance.ts

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  sparkline: number[];
  updatedAt: number;
  marketOpen: boolean;
}

const SYMBOLS: Array<{ symbol: string; name: string }> = [
  { symbol: 'BZ=F', name: 'Brent Crude' },
  { symbol: 'CL=F', name: 'WTI Crude' },
  { symbol: 'XLE', name: 'Energy ETF' },
  { symbol: 'USO', name: 'US Oil Fund' },
  { symbol: 'XOM', name: 'ExxonMobil' },
];

async function fetchSymbol(symbol: string): Promise<MarketQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const json = await res.json() as { chart: { result: Array<{ meta: { symbol: string; regularMarketPrice: number; previousClose: number; marketState: string }; timestamp: number[]; indicators: { quote: Array<{ close: number[] }> } }>; error: unknown } };
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const { meta, indicators } = result;
    const closes = indicators.quote[0]?.close?.filter(Boolean) ?? [];
    const price = meta.regularMarketPrice;
    const prevClose = meta.previousClose;
    const change = price - prevClose;
    const changePct = (change / prevClose) * 100;
    const entry = SYMBOLS.find(s => s.symbol === symbol);
    return {
      symbol,
      name: entry?.name ?? symbol,
      price,
      change,
      changePct,
      sparkline: closes,
      updatedAt: Date.now(),
      marketOpen: meta.marketState === 'REGULAR',
    };
  } catch {
    return null;
  }
}

export async function fetchMarkets(): Promise<MarketQuote[]> {
  const results = await Promise.allSettled(SYMBOLS.map(s => fetchSymbol(s.symbol)));
  return results
    .filter((r): r is PromiseFulfilledResult<MarketQuote> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}
```

- [ ] **Step 4: Run tests**

```
npx vitest run server/__tests__/adapters/yahoo-finance.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/adapters/yahoo-finance.ts server/__tests__/adapters/yahoo-finance.test.ts
git commit -m "feat(18): add Yahoo Finance adapter for 5 oil market symbols"
```

---

### Task 18-2: /api/markets route

**Files:**
- Create: `server/routes/markets.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Implement markets.ts**

Follow `sites.ts` pattern. Details:
- Import: `fetchMarkets` from `../adapters/yahoo-finance.js`
- Cache key: `'markets:quotes'`
- Logical TTL: `60_000` (60s)
- Redis TTL: `600` (10min hard)
- On Yahoo Finance failure: return `{ data: [], stale: false, lastFresh: Date.now() }` (graceful degradation, not error)

- [ ] **Step 2: Register route**

```typescript
import { marketsRouter } from './routes/markets.js';
app.use('/api/markets', marketsRouter);
```

- [ ] **Step 3: Run tests**

```
npx vitest run
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/routes/markets.ts server/index.ts
git commit -m "feat(18): add /api/markets route with 60s Redis cache"
```

---

### Task 18-3: marketStore + useMarketPolling + MarketsPanel

**Files:**
- Create: `src/stores/marketStore.ts`
- Create: `src/hooks/useMarketPolling.ts`
- Create: `src/components/markets/SparklineChart.tsx`
- Create: `src/components/layout/MarketsPanelSlot.tsx`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Implement marketStore.ts**

Same pattern as `siteStore.ts`. Shape:
```typescript
interface MarketState {
  quotes: MarketQuote[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  setMarketData: (response: CacheResponse<MarketQuote[]>) => void;
  setError: () => void;
  setLoading: () => void;
}
```

Export `MarketQuote` type from `src/types/market.ts` (re-export from `server/adapters/yahoo-finance.js`).

- [ ] **Step 2: Implement useMarketPolling.ts**

Follow `useEventPolling.ts` pattern. Poll interval: `60_000` (60s). Endpoint: `/api/markets`. Tab visibility: always re-fetch on resume.

- [ ] **Step 3: Implement SparklineChart.tsx**

```tsx
// src/components/markets/SparklineChart.tsx
export function SparklineChart({ data, positive }: { data: number[]; positive: boolean }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 60, h = 20;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const color = positive ? '#22c55e' : '#ef4444';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 4: Implement MarketsPanelSlot.tsx**

```tsx
// src/components/layout/MarketsPanelSlot.tsx
import { useUIStore } from '@/stores/uiStore';
import { useMarketStore } from '@/stores/marketStore';
import { OverlayPanel } from '@/components/ui/OverlayPanel';
import { SparklineChart } from '@/components/markets/SparklineChart';

function fmt(n: number, decimals = 2) { return n.toFixed(decimals); }

export function MarketsPanelSlot() {
  const isCollapsed = useUIStore(s => s.isMarketsCollapsed);
  const toggle = useUIStore(s => s.toggleMarkets);
  const quotes = useMarketStore(s => s.quotes);
  const status = useMarketStore(s => s.connectionStatus);

  const allClosed = quotes.length > 0 && quotes.every(q => !q.marketOpen);

  return (
    <div data-testid="markets-panel">
      <OverlayPanel className={allClosed ? 'opacity-50' : ''}>
        <button onClick={toggle} className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-text-secondary">
          <span>Markets{allClosed ? ' (Closed)' : ''}</span>
          <span className="text-text-muted">{isCollapsed ? '+' : '-'}</span>
        </button>
        {!isCollapsed && (
          <div className="mt-2 flex flex-col gap-2">
            {status === 'loading' && <span className="text-xs text-text-muted">Loading…</span>}
            {quotes.map(q => {
              const positive = q.changePct >= 0;
              return (
                <div key={q.symbol} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs font-semibold text-text-secondary tabular-nums">{q.symbol}</span>
                      <span className="text-[10px] text-text-muted truncate">{q.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs tabular-nums text-text-primary">${fmt(q.price)}</span>
                      <span className={`text-[10px] tabular-nums ${positive ? 'text-green-400' : 'text-accent-red'}`}>
                        {positive ? '+' : ''}{fmt(q.changePct)}%
                      </span>
                    </div>
                  </div>
                  <SparklineChart data={q.sparkline} positive={positive} />
                </div>
              );
            })}
          </div>
        )}
      </OverlayPanel>
    </div>
  );
}
```

- [ ] **Step 5: Add isMarketsCollapsed + toggleMarkets to uiStore**

Same pattern as other panel toggles (boolean field + toggle action, no persistence needed).

- [ ] **Step 6: Mount in AppShell.tsx**

```tsx
import { MarketsPanelSlot } from '@/components/layout/MarketsPanelSlot';
import { useMarketPolling } from '@/hooks/useMarketPolling';
// in AppShell():
useMarketPolling();
// In JSX, add MarketsPanelSlot to the bottom-left column below LayerTogglesSlot
```

- [ ] **Step 7: Run all tests**

```
npx vitest run
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/stores/marketStore.ts src/hooks/useMarketPolling.ts src/components/markets/SparklineChart.tsx src/components/layout/MarketsPanelSlot.tsx src/stores/uiStore.ts src/components/layout/AppShell.tsx src/types/market.ts
git commit -m "feat(18): add marketStore, useMarketPolling, and MarketsPanel with sparklines"
```

---

## Phase 19: Search, Filter & UI Cleanup

---

### Task 19-1: Remove Min granularity from date range filter

**Files:**
- Modify: `src/components/filter/DateRangeFilter.tsx` (or wherever `STEP_MS` is defined)
- Modify: `src/stores/filterStore.ts` (if `STEP_MS` is there)

- [ ] **Step 1: Find STEP_MS definition**

```
grep -r "STEP_MS" src/
```

- [ ] **Step 2: Remove minute entry**

In the `STEP_MS` record, delete the `'minute'` key and its value (the key is lowercase `'minute'`, not `'Min'` — the button label and the key are different). Remove the button rendering the `'Min'` label from the granularity toggle UI in `DateRangeFilter.tsx`. If the current granularity state is `'minute'`, reset it to `'hour'` as the new default.

- [ ] **Step 3: Run tests**

```
npx vitest run src/__tests__/FilterPanel.test.tsx
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/filter/DateRangeFilter.tsx src/stores/filterStore.ts
git commit -m "feat(19): remove Min granularity from date range filter"
```

---

### Task 19-2: Filter panel Reset All + grouped sections

**Files:**
- Modify: `src/stores/filterStore.ts`
- Modify: `src/components/layout/FilterPanelSlot.tsx`

- [ ] **Step 1: Add clearAll action to filterStore**

```typescript
clearAll: () => set({
  selectedCountries: [],
  flightCountries: [],
  // ... all filter fields reset to null/empty/defaults
  // Do NOT reset DEFAULT_EVENT_WINDOW_MS (it's a constant, not a field)
}),
```

- [ ] **Step 2: Add Reset All button to FilterPanelSlot**

At the top of the filter panel, add:
```tsx
<button onClick={clearAll} className="text-[10px] text-accent-red hover:text-red-300">
  Reset All
</button>
```

Group existing filter controls under section headings: **Flights**, **Ships**, **Events**, **Date Range**. Each section collapses independently using existing `isFlightFiltersOpen` / `isShipFiltersOpen` / `isEventFiltersOpen` state.

- [ ] **Step 3: Run tests**

```
npx vitest run src/__tests__/FilterPanel.test.tsx src/__tests__/filterStore.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/stores/filterStore.ts src/components/layout/FilterPanelSlot.tsx
git commit -m "feat(19): add Reset All and grouped sections to filter panel"
```

---

### Task 19-3: LayerTogglesSlot scrollable + global search bar

**Files:**
- Modify: `src/components/layout/LayerTogglesSlot.tsx`
- Create: `src/stores/searchStore.ts`
- Create: `src/components/layout/SearchBarSlot.tsx`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Make LayerTogglesSlot scrollable**

Wrap the toggle list in a `max-h-[50vh] overflow-y-auto` div so it doesn't overflow at short viewport heights.

- [ ] **Step 2: Implement searchStore.ts**

```typescript
// src/stores/searchStore.ts
import { create } from 'zustand';
import type { MapEntity } from '@/types/entities';

interface SearchState {
  query: string;
  results: MapEntity[];
  isOpen: boolean;
  setQuery: (q: string) => void;
  setResults: (r: MapEntity[]) => void;
  clearSearch: () => void;
}

export const useSearchStore = create<SearchState>()((set) => ({
  query: '',
  results: [],
  isOpen: false,
  setQuery: (query) => set({ query, isOpen: query.length > 0 }),
  setResults: (results) => set({ results }),
  clearSearch: () => set({ query: '', results: [], isOpen: false }),
}));
```

- [ ] **Step 3: Implement SearchBarSlot.tsx**

```tsx
// src/components/layout/SearchBarSlot.tsx
import { useEffect, useRef } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSiteStore } from '@/stores/siteStore';
import { useUIStore } from '@/stores/uiStore';
import type { MapEntity } from '@/types/entities';

function fuzzyMatch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

export function SearchBarSlot() {
  const query = useSearchStore(s => s.query);
  const results = useSearchStore(s => s.results);
  const isOpen = useSearchStore(s => s.isOpen);
  const setQuery = useSearchStore(s => s.setQuery);
  const setResults = useSearchStore(s => s.setResults);
  const clearSearch = useSearchStore(s => s.clearSearch);
  const selectEntity = useUIStore(s => s.selectEntity);
  const openDetailPanel = useUIStore(s => s.openDetailPanel);
  const inputRef = useRef<HTMLInputElement>(null);

  const flights = useFlightStore(s => s.flights);
  const ships = useShipStore(s => s.ships);
  const events = useEventStore(s => s.events);
  const sites = useSiteStore(s => s.sites);

  // Cmd+K / Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') clearSearch();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [clearSearch]);

  // Search across all stores when query changes
  useEffect(() => {
    if (!query) { setResults([]); return; }
    const matches: MapEntity[] = [
      ...flights.filter(f => fuzzyMatch(f.data.callsign, query) || fuzzyMatch(f.data.icao24, query)),
      ...ships.filter(s => fuzzyMatch(s.data.shipName, query) || fuzzyMatch(String(s.data.mmsi), query)),
      ...events.filter(e => fuzzyMatch(e.data.locationName, query) || fuzzyMatch(e.type, query)),
      ...sites.filter(s => fuzzyMatch(s.label, query) || fuzzyMatch(s.data.siteType, query)),
    ].slice(0, 10);
    setResults(matches);
  }, [query, flights, ships, events, sites, setResults]);

  const handleSelect = (entity: MapEntity) => {
    selectEntity(entity.id);
    openDetailPanel();
    clearSearch();
  };

  const GROUP_LABELS: Record<string, string> = {
    flight: 'Flights', ship: 'Ships', site: 'Sites',
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[var(--z-controls)] w-72">
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search… (⌘K)"
        className="w-full rounded bg-surface/90 backdrop-blur px-3 py-2 text-sm text-text-primary placeholder:text-text-muted border border-surface-raised outline-none focus:border-accent-blue"
      />
      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-1 w-full rounded bg-surface/95 backdrop-blur border border-surface-raised shadow-xl max-h-64 overflow-y-auto">
          {results.map(entity => (
            <button
              key={entity.id}
              onClick={() => handleSelect(entity)}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-surface-raised text-left"
            >
              <span className="text-text-muted text-[10px] w-12 shrink-0">
                {GROUP_LABELS[entity.type] ?? entity.type}
              </span>
              <span className="text-text-primary truncate">{entity.label || entity.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Mount SearchBarSlot in AppShell.tsx**

```tsx
import { SearchBarSlot } from '@/components/layout/SearchBarSlot';
// in JSX, add at the top level (sibling to map container):
<SearchBarSlot />
```

- [ ] **Step 5: Run all tests**

```
npx vitest run
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores/searchStore.ts src/components/layout/SearchBarSlot.tsx src/components/layout/LayerTogglesSlot.tsx src/components/layout/AppShell.tsx
git commit -m "feat(19): add global search bar and scrollable layer toggles"
```

---

### Task 19-4: Layout audit

**Files:**
- Modify: `src/components/layout/DetailPanelSlot.tsx`
- Modify: `src/components/ui/StatusPanel.tsx` (if density issues)
- Modify: `app.css` (z-index audit)

- [ ] **Step 1: Audit z-index CSS vars**

Open `app.css` (or wherever CSS vars are defined). Verify z-index stack is consistent:
```
--z-map: 0
--z-controls: 10
--z-detail: 20
--z-notification-bell: 22
--z-modal: 30
```
Fix any conflicts.

- [ ] **Step 2: Test at 1280px viewport width**

Manually verify (or add a snapshot test) that panels don't clip at 1280px width. If the left column (Title + Status + Counters + Toggles) clips with the search bar or right panels, adjust margins.

- [ ] **Step 3: Run full test suite**

```
npx vitest run
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app.css src/components/layout/DetailPanelSlot.tsx
git commit -m "feat(19): layout audit — fix z-index stack and 1280px responsiveness"
```

---

## Phase 20: Production Review & Deploy Sync

---

### Task 20-1: Local E2E smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```
Expected: Vite on :5173, Express on :3001, no TypeScript errors

- [ ] **Step 2: Verify all 7 API endpoints return data**

```bash
curl http://localhost:3001/api/flights | jq '.data | length'
curl http://localhost:3001/api/ships | jq '.data | length'
curl http://localhost:3001/api/events | jq '.data | length'
curl http://localhost:3001/api/sites | jq '.data | length'
curl http://localhost:3001/api/news | jq '.data | length'
curl http://localhost:3001/api/notifications | jq 'length'
curl http://localhost:3001/api/markets | jq '.data | length'
```
Expected: all return numeric values (sites/news may be 0 if APIs are slow, markets may be 0 if markets closed)

- [ ] **Step 3: Verify UI features in browser**

Open `http://localhost:5173` and check:
- Key sites render on map (toggle on/off works per sub-type)
- Event icons are smaller than flight/ship icons
- Events default to last 24h (map should not show events from before yesterday)
- Bell icon visible top-right, click opens drawer
- Notification cards show with severity bars
- Oil markets panel visible bottom-left with prices and sparklines
- `Cmd+K` opens search, typing returns results, clicking flies to entity
- Date range slider has only Hr and Day granularity (no Min)
- Filter panel has Reset All button and grouped sections

---

### Task 20-2: Full test suite + build verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```
Expected: PASS — zero failures

- [ ] **Step 2: Run production build**

```bash
npm run build
```
Expected: clean exit — Vite + tsup + tsc all pass with zero errors

---

### Task 20-3: Vercel env var audit

- [ ] **Step 1: Check required env vars in Vercel dashboard**

Go to your Vercel project → Settings → Environment Variables. Confirm all are present:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `OPENSKY_CLIENT_ID`
- `OPENSKY_CLIENT_SECRET`
- `ADSB_EXCHANGE_API_KEY`
- `AISSTREAM_API_KEY`

Note: No new env vars are required for Phases 15–19 (Overpass, Yahoo Finance, BBC RSS, Al Jazeera RSS are all unauthenticated).

- [ ] **Step 2: Verify Vercel function routes include new endpoints**

In `vercel.json`, confirm the `/api/*` rewrite rule covers all 7 routes (it should already — it's a wildcard).

---

### Task 20-4: Merge, tag, push

- [ ] **Step 1: Merge all phase branches to main**

```bash
git checkout main
git merge feature/15-intelligence-layer --no-ff -m "feat: v1.1 Intelligence Layer (phases 15-20)"
```

- [ ] **Step 2: Run build + tests on main**

```bash
npm run build && npx vitest run
```
Expected: PASS

- [ ] **Step 3: Tag v1.1**

```bash
git tag v1.1 -m "v1.1: Intelligence Layer — key sites, news, notifications, markets, search"
```

- [ ] **Step 4: Push to remote**

```bash
git push origin main --tags
```
Expected: Vercel auto-deploys from main push

- [ ] **Step 5: Verify production**

After Vercel deploy completes (~2 min), open the prod URL and re-run the smoke test checks from Task 20-1. Confirm no CORS errors in console.

- [ ] **Step 6: Update project docs**

Update `PROJECT_STATUS.md`: add phases 15–20 as Done, update "Current Focus" to "All v1.1 milestone phases complete."

```bash
git add PROJECT_STATUS.md
git commit -m "docs: update PROJECT_STATUS for v1.1 milestone completion"
git push origin main
```
