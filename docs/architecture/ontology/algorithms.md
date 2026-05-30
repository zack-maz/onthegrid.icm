# Algorithm Decisions

Eight hot-path algorithms, each with purpose, input/output, the
decisions that shaped it, and the reasoning behind those decisions.
These are the places where a design choice was actually made — the
pieces most worth reviewing for portfolio signal.

Source pointers reference the canonical implementation. If docs and
code disagree, the code wins.

---

## 1. Threat density clustering

**File:** [`src/components/map/layers/ThreatHeatmapOverlay.tsx`](../../../src/components/map/layers/ThreatHeatmapOverlay.tsx)
**Supporting:** [`src/components/map/layers/RadialGradientExtension.ts`](../../../src/components/map/layers/RadialGradientExtension.ts)
**Purpose:** Turn a cloud of conflict events into visible "hot zones"
on the map without losing per-cluster detail.

**Input:** Array of `ConflictEventEntity` after filter pass.
**Output:** Array of `ThreatCluster` (one blob per hot zone, with a
centroid, weight, radius, and list of member event IDs).

### Steps

1. **Grid binning.** Project each event into a 0.25° × 0.25° grid
   cell. Integer cell indices via `Math.round(lat * 4)` /
   `Math.round(lng * 4)` to avoid floating-point key mismatches.
2. **Per-cell aggregation.** Sum weights, count events, track
   dominant type, latest timestamp, fatalities, mentions, sources,
   average Goldstein.
3. **BFS cluster merge.** Treat adjacent cells (8-neighborhood) as
   connected; walk connected components to produce clusters. Each
   component becomes one `ThreatCluster`.
4. **Centroid.** Compute the centroid as the mean of the actual
   event `lat`/`lng` (not the grid-cell center). This was a fix in
   Phase 24 — using the grid-cell centroid caused visible drift on
   sparse clusters.
5. **Radius.** Linearly interpolate from 12px (single cell) to 100px
   (20+ cells) with a 30km meter-space floor, so even isolated
   events are visible.
6. **Color.** Normalize cluster weight against a P90 across all
   clusters and interpolate a 4-stop thermal palette (deep purple →
   magenta → orange → bright red). The P90 normalization prevents
   a single ultra-hot cluster from washing out everything else.
7. **Radial falloff.** A custom deck.gl `LayerExtension` injects a
   GLSL `fs:DECKGL_FILTER_COLOR` hook that applies
   `smoothstep(0.3, 1.0, distance_to_center)` for a soft radial
   gradient. Additive blending (`blendColorDstFactor: 'one'`) makes
   overlapping clusters intensify naturally.

### Why not deck.gl's built-in heatmap?

deck.gl's stock `HeatmapLayer` uses a GPU density calculation with
a fixed radius per point. We needed per-cluster radius (scaled to
cluster size) and per-cluster color (scaled to weight), which the
stock heatmap doesn't support. Writing a custom GLSL extension was
cheaper than fighting the stock layer.

### Weight formula

```ts
clusterWeight = typeWeight × log2(mentions + 1) × log2(sources + 1)
              × fatalityFactor × goldsteinHostility
```

- `typeWeight`: same weights as `computeSeverityScore` (airstrike=10,
  explosion=8, on_ground=6, targeted=7, other=3).
- `log2` of mentions and sources dampens outliers from single
  high-coverage events.
- `fatalityFactor` boosts events with reported casualties.
- `goldsteinHostility` maps the -10 to +10 GDELT Goldstein scale into
  a positive multiplier for hostile events.
- **No temporal decay.** Date-range filtering handles recency; adding
  a decay factor made clusters jitter as stale events fell below a
  threshold mid-render.

---

## 2. GDELT event dispersion

**File:** [`server/lib/dispersion.ts`](../../../server/lib/dispersion.ts)
**Purpose:** Stop city-centroid GDELT events from stacking on top of
each other at the same lat/lng.

**Status (Phase 27):** Dispersion is retained for the raw-GDELT
fallback path only. LLM-processed events have per-event `precision`
indicators (`exact` | `neighborhood` | `city` | `region`) and
Nominatim-geocoded coordinates, making centroid dispersion unnecessary
for enriched events. When the LLM is unavailable, dispersion still
runs on the raw GDELT path to prevent stacking.

**Input:** Array of `ConflictEventEntity` fresh from the GDELT parse.
**Output:** Same array with city-centroid events spread into
concentric rings around their centroids.

### Problem

GDELT geocodes most events to the nearest known city centroid. If
three airstrikes hit Kirkuk in the same 15-minute window, they all
get the identical `lat`/`lng` (36.3371, 44.4049) and the map shows
what looks like one event.

### Solution: concentric ring dispersion

Events matched to a known city centroid (via
`findCentroidKey` with a 15 km radius) get slotted into one of 36
ring positions:

- Ring 0: 6 slots at 3 km radius
- Ring 1: 12 slots at 6 km (with half-step angular offset)
- Ring 2: 18 slots at 9 km
- Slot ≥ 36 wraps around Ring 2

Slot assignment is **deterministic**: events are sorted by timestamp
and the Nth event gets slot N. This guarantees that:

- The same input produces the same output across requests (good for
  caching).
- Two adjacent polls don't shuffle the visible positions.
- Slot order tracks time order, so the "first" event in a ring is
  the oldest.

Longitude offsets are corrected for latitude via `cos(lat)` so rings
stay circular on the mercator projection.

### Decisions

- **Only `ActionGeo_Type` 3 (city) and 4 (landmark)** are dispersed
  when that field is present. Country-level rows (type 1) and
  state-level rows (type 2) have too much uncertainty to disperse
  honestly.
- **Pass-through when no centroid matches.** Events without a
  matching city centroid in `CITY_CENTROIDS` are left untouched.
  For LLM-processed events this is less of an issue because each
  event has a per-event `precision` indicator and Nominatim-geocoded
  coordinates, so stacking is visible to the user via precision rings.
- **15 km match radius** is nearest-neighbor, not a tolerance box.
  GDELT re-geocodes the same city to slightly different coordinates
  from poll to poll, so a strict box would miss matches that a
  nearest-neighbor search catches.
- **Original lat/lng preserved** in `data.originalLat`/`originalLng`
  so the detail panel can show "real" location even after dispersion.

---

## 3. Severity scoring

**File:** [`src/lib/severity.ts`](../../../src/lib/severity.ts)
**Purpose:** Rank conflict events by "how much does this matter
right now" for the notification bell.

**Input:** One `ConflictEventEntity`.
**Output:** A positive `number` score. Higher = more severe.

### Formula

```ts
score = typeWeight × log2(1 + mentions) × log2(1 + sources) × recencyDecay
```

- **`typeWeight`**: `TYPE_WEIGHTS[event.type]`, hand-assigned values
  from 10 (airstrike, wmd) down to 2 (blockade). This is the main
  lever for "importance ordering" — an assassination outranks an
  assault.
- **`log2(1 + mentions)`**: dampens the effect of a single viral
  story flooding the mentions count. log2 was chosen over log10
  because the max observed mentions in real GDELT traffic is
  ~10^3, so log2 gives us more separation across the realistic
  range.
- **`log2(1 + sources)`**: same logic, for source diversity. Sources
  is a weaker signal than mentions because one wire service can
  generate hundreds of mentions; sources tells us how broadly the
  story is being reported.
- **`recencyDecay`**: `1 / (1 + ageHours / 24)`, a 24-hour half-life
  in the loose sense (value is 0.5 at 24h, 0.33 at 48h, etc.).
  Chosen over exponential decay for its cheap computation and
  smooth tail.

### Decisions

- **No wall clock in the formula beyond `ageHours`.** Tests use
  `vi.useFakeTimers()` before comparing scores so two back-to-back
  calls in the same tick produce identical results (microsecond
  drift in `Date.now()` broke the first test we wrote).
- **`classifySeverity`** (High / Medium / Low) uses the same formula
  **without** the recency decay, because the filter bucket should
  be stable over time — a week-old airstrike is still a High-
  severity event for search purposes.
- **Defaults.** `numMentions` and `numSources` default to 1 if
  missing, which gives `log2(2) = 1` and leaves the type weight as
  the dominant factor for under-reported events.

---

## 4. News clustering

**File:** [`server/lib/newsClustering.ts`](../../../server/lib/newsClustering.ts)
**Purpose:** Deduplicate near-identical headlines across the GDELT
DOC feed and 5 RSS feeds.

**Input:** Array of `NewsArticle`.
**Output:** Array of `NewsCluster`, sorted by `lastUpdated`
descending.

### Two-pass algorithm

**Pass 1: URL hash dedup.** Articles are deduped by
`hashUrl(article.url)` which is a SHA-256 truncated to 16 hex
chars. Keep the first occurrence. This is exact-duplicate removal
— identical URLs from different scrape paths.

**Pass 2: Jaccard title clustering.** Walk the remaining articles.
For each unseen article:

1. Tokenize its title into a `Set<string>` (lowercase, alphanumeric
   only, dropped empty tokens).
2. Scan forward through the array. For each later article, tokenize
   its title and compute
   `|A ∩ B| / |A ∪ B|` (Jaccard similarity).
3. If similarity ≥ **0.8** AND both titles have ≥ **5 tokens**, merge
   the candidate into the current cluster.
4. Mark all merged articles as seen.

### Decisions

- **Threshold 0.8.** Empirically, 0.7 grouped unrelated articles
  about the same country; 0.9 missed obvious rewrites. 0.8 is the
  sweet spot on our sample data.
- **5-token minimum for fuzzy match.** Very short titles ("Iran
  news", "Breaking") are too noisy for Jaccard. We fall back to
  URL-hash dedup only for those.
- **7-day sliding window.** Implied by the caller — clustering only
  runs on articles from the last 7 days via the window constant
  in `server/config.ts`. Articles older than 7 days are passed
  through as their own single-article clusters.
- **24h fuzzy window** is a tighter window inside the 7-day outer
  window: even similar-titled articles more than 24h apart are
  kept separate so the feed doesn't cluster "this weekend's
  attack" with last Tuesday's.

---

## 5. News matching

**File:** [`src/lib/newsMatching.ts`](../../../src/lib/newsMatching.ts)
**Purpose:** Bind qualitative headlines from the news feed to
structured GDELT events so the notification bell can show "airstrike
reported; 3 matching headlines".

**Input:** One `ConflictEventEntity`, array of `NewsCluster[]`.
**Output:** Top 0-3 `MatchedHeadline[]` sorted by total relevance.

### Three-component score

For each cluster's primary article:

```ts
temporalScore = 1 - |event.timestamp - article.publishedAt| / 24h
geoScore      = article has coords AND within 100km
                ? 2 × (1 - distKm / 100)
                : 0
keywordScore  = 0.5 × count(eventLocationKeywords ∩ articleTitleWords)
total         = temporalScore + geoScore + keywordScore
```

### Filters

- **Hard temporal gate.** Articles more than 24h from the event are
  dropped before scoring.
- **Minimum 3-character keyword length** to avoid matching "the",
  "of", "in", etc.
- **Top 3 only.** More than 3 headlines per notification overflows
  the card visually; 3 is the UI limit.

### Decisions

- **Geographic is weighted 2×** because coordinate-match is a much
  stronger signal than keyword overlap — if the article is within
  100km of the event, it's almost certainly reporting on it.
- **Additive, not multiplicative.** We want an article with great
  keyword match to still rank well even without coordinates.
- **No NLP.** We tried an NLP actor/action/target extraction in
  Phase 26.2 and it made things worse than a dumb keyword match
  because GDELT headlines are too noisy. Phase 26.2 was scrapped;
  `matchNewsToEvent` is the survivor.

---

## 6. Basin lookup (WRI Aqueduct)

**File:** [`server/lib/basinLookup.ts`](../../../server/lib/basinLookup.ts)
**Purpose:** Assign a WRI Aqueduct water-stress score to a given
water facility by lat/lng.

**Input:** `lat`, `lng` coordinates.
**Output:** `WaterStressIndicators` object with composite health.

### The problem

WRI Aqueduct 4.0 publishes 6377 river basins for the Middle East as
a GeoPackage of polygons. Point-in-polygon against 6377 arbitrary
polygons is a bounded problem, but the polygon file is ~50 MB —
too big to bundle in a serverless function.

### The solution

1. Strip the polygons. Keep only the basin attributes: `pfaf_id`,
   `name_0` (country), `bws_raw`, `bws_score`, and the other
   0-5 stress scores. Ship this as `src/data/aqueduct-basins.json`.
2. Deduplicate by `pfaf_id` (several basin records can share an
   ID).
3. Group basins by country (`name_0`).
4. For each facility, find the **nearest country centroid** using
   the haversine distance to 29 hand-maintained
   `COUNTRY_CENTROIDS`. Then select the **median-stress basin**
   from that country as the representative value.
5. Return "No Data" if no country is within 200 km.

### Decisions

- **O(b) is fine at this size.** 6377 basins × 29 countries × a
  few facilities per request is well under a millisecond of
  computation. A KD-tree or spatial index would be overkill.
- **Median over mean.** Mean gives high-stress outliers
  disproportionate weight; median is more representative of
  "typical stress in the country's basins."
- **200 km fallback radius.** A facility in the middle of the
  Gulf is still matched to Iran or Saudi Arabia rather than
  returning "No Data."
- **Known limitation:** This is lossy. A dam on the Turkish-Syrian
  border gets a country-level stress value when it really sits on a
  specific basin with known stress. Indexing actual basin polygons
  would be more accurate but the ~50 MB polygon file doesn't fit
  in a serverless bundle. Tracked for a future performance phase.

---

## 7. Composite water health

**File:** [`src/lib/waterStress.ts`](../../../src/lib/waterStress.ts)
**Purpose:** Combine long-term baseline stress with short-term
precipitation anomaly into a single 0-1 health score.

**Input:** `WaterStressIndicators` + optional precipitation data.
**Output:** `compositeHealth: number` in `[0, 1]`, where 0 is
"catastrophic" and 1 is "healthy."

### Formula

```ts
baselineHealth      = sqrt(max(0, 1 - bws_score / 5))
precipitationFactor = precipAnomalyRatio (capped to ~[0.5, 1.5])
compositeHealth     = clamp(0, 1, 0.75 × baselineHealth + 0.25 × precipitationFactor)
```

- **Square root on baseline.** Without it, baseline health bunches
  up near 0 for anything above score 3.5, making "high stress" and
  "extremely high stress" visually indistinguishable. The sqrt
  spreads the distribution.
- **75% baseline / 25% precipitation.** Long-term stress dominates
  because it's the structural constraint; 30-day precipitation is
  a rolling modifier. Flipping the weights made the map jitter
  with each precipitation update.
- **Clamped.** Arithmetic can produce values slightly outside
  `[0, 1]`; we clamp explicitly rather than trusting the caller.

---

## 8. Time grouping

**File:** [`src/lib/timeGroup.ts`](../../../src/lib/timeGroup.ts)
**Purpose:** Bucket notifications into human-readable time windows
for the NotificationBell dropdown.

**Input:** Unix ms timestamp.
**Output:** `'Last hour' | 'Last 6 hours' | 'Last 24 hours' | 'Older'`.

### Why not relative timestamps?

The notification list is grouped, not individually timestamped. So
instead of "42 minutes ago" next to every item we display three
sections: Last hour, Last 6 hours, Last 24 hours. This reduces
visual clutter and matches how humans actually think about recent
news.

### The implementation

A straight-line `if / else if` chain against 1h / 6h / 24h
thresholds. The bucket function runs once per notification at
render time and is memoized by the calling hook; the complexity
is O(n) for n notifications and O(1) per item.

---

## 9. LLM event extraction (Phase 27 → v3 narrowed Phase 29 / 30 / 30.1 / 34 / 35)

**Files:**
[`server/lib/eventGrouping.ts`](../../../server/lib/eventGrouping.ts),
[`server/lib/llmEventExtractor.v3.ts`](../../../server/lib/llmEventExtractor.v3.ts) (sole extractor — v1/v2 deleted Phase 29 SIMPLIFY-04),
[`server/lib/llmExtractionPipeline.ts`](../../../server/lib/llmExtractionPipeline.ts)
**Supporting:**
[`server/adapters/llm-provider.ts`](../../../server/adapters/llm-provider.ts),
[`server/lib/freeClaudeRouter.ts`](../../../server/lib/freeClaudeRouter.ts) (declared cascade construction),
[`server/lib/llmResolver.ts`](../../../server/lib/llmResolver.ts) (6-path geocoding resolver),
[`server/adapters/nominatim.ts`](../../../server/adapters/nominatim.ts)
**Purpose:** Transform raw GDELT CSV rows into structured, precisely
geocoded conflict events with human-readable summaries.

**Input:** Array of raw `ConflictEventEntity` from the GDELT parse.
**Output:** Array of enriched `ConflictEventEntity` with `summary`,
`casualties`, `precision`, `actors`, `sourceCount`, and
`llmProcessed: true`.

### Pipeline

1. **Grouping.** Raw GDELT rows are clustered by
   `groupGdeltRows()`: same SQLDATE + same CAMEO root code + within
   50 km geographic proximity. Each group represents a single
   real-world incident reported by multiple GDELT rows.
2. **Batch LLM call.** Groups are batched (`LLM_BATCH_SIZE`, default 2
   per Phase 30 D-07 env-tunable; previously 8 in v1) and dispatched
   in parallel through `concurrencyLimit` (FIFO queue, default
   `LLM_V3_CONCURRENCY=12`). Each call hits **NVIDIA NIM** (qwen-235b
   instruct) — the sole active runtime provider as of Phase 34. The
   prompt asks the LLM to classify each group into one of the 5
   `ConflictEventType` values and extract structured data.
3. **Zod validation.** The LLM response is parsed as JSON and
   validated against a Zod schema. Invalid entries are DLQ'd to
   `events:llm-dlq` (SADD bounded 200, 7d TTL); valid entries proceed.
4. **6-path location resolver.** The LLM returns a structured location
   hierarchy (not raw coords). `resolveLocation(hierarchy, ctx)`
   dispatches through six paths in order: `own-site-snapshot` →
   `poi-amenity-nominatim` → `nominatim-direct` →
   `nominatim-verified-2pass` → `gdelt-actiongeo-fallback` →
   `bellingcat-coord-passthrough`. Nominatim respects 1 req/s and
   ME-viewbox constraints; results Redis-cached for 30 days at
   `geocode:fwd:constrained:v2:<hash>`.
5. **Enrichment.** Each validated event is merged back into the
   entity format with the new fields populated and
   `llmProcessed: true` set. The full batch result is held in memory
   until the cron run completes, then written once to `events:llm:v3`
   via `mergeAndPersistLlmEntities` (Phase 30 SIMPLIFY-01 terminal
   end-of-run write).

### Decisions

- **NIM-only at runtime (Phase 30.1 + 34).** `freeClaudeRouter.ts`
  constructs a declared NIM → OpenRouter cascade, but
  `skipOpenRouter: true` at `llmEventExtractor.v3.ts:622, 929`
  removes OpenRouter from the runtime path (Phase 30.1 — free-tier
  probe landed in not-viable bucket, 27/30 rate_limited). Cerebras +
  Groq were deleted Phase 29 SIMPLIFY-04 and remain deferred Phase
  34 (operator chose to skip free-tier provisioning; no adapter, no
  probe). See [`llm-pipeline-reliability.md`](../llm-pipeline-reliability.md)
  §"Multi-Provider Cascade (Phase 34)" for the cascade-shape table.
- **2 groups per batch (post Phase 30).** Phase 30 D-07 made
  `LLM_BATCH_SIZE` env-tunable; default 2 because the eval-harness
  fixture bundling bug (Phase 30 D-03) means the ±3pp regression
  budget cannot be empirically validated for larger batches.
  Operator can opt into 4 / 6 / 8 mid-incident without redeploy.
- **Zod over manual parsing.** The LLM output is unpredictable.
  Zod's `safeParse` gives typed, validated output or a clean
  rejection routed to the DLQ — no runtime surprises.
- **Cron-only writer (Phase 29 anti-pattern #17).** LLM extraction
  runs from `/api/cron/refresh-events` (daily 4am UTC, Bearer-gated)
  ONLY. `/api/events` is cache-only — the Phase 27.4.6 anti-pattern
  forbade re-introducing fire-and-forget extraction into the read
  path after Vercel Fluid Compute silently killed v2's IIFE in
  production. 15-min cooldown (`events:llm-process-ts`) is bypassed
  by cold-cache self-heal when `events:llm:v3` is empty.
- **Graceful degradation (Pitfall 1 cache bridge, ADR-0010 D-04).**
  If NIM is down, the circuit breaker trips, the cron fails, or
  `NVIDIA_NIM_API_KEY` is unset, `/api/events` serves raw GDELT via
  the Pitfall 1 bridge in `server/routes/events.ts`. The map never
  goes blank.
- **Single terminal cache (`events:llm:v3`).** The v1/v2 keys
  (`events:llm`, `events:llm:v2`) were deleted Phase 29 alongside
  their extractors. The per-batch observability key
  (`events:llm:v3:partial`) was retired Phase 35 SIMPLIFY-02 —
  Hobby-era 300s mitigation that no longer earned its keep under
  Vercel Pro's 800s ceiling. `events:gdelt` remains as the raw
  fallback served by the Pitfall 1 bridge.

---

## See also

- [`types.md`](./types.md) — the types these algorithms operate on.
- [`complexity.md`](./complexity.md) — where each algorithm shows up
  in the hot-path table.
- [`state-machines.md`](./state-machines.md) — the state transitions
  that drive when these algorithms run.
