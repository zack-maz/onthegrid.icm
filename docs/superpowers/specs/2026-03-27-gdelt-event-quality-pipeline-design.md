# Phase 21.2: GDELT Event Quality Pipeline

## Problem

GDELT event data suffers from three accuracy issues:

1. **Misplaced events** — GDELT geocodes to geopolitical context rather than actual event location. An assassination attempt in NYC on a pro-Palestinian activist gets pinned to Israel because Israel is the article's geopolitical subject.
2. **Mislabeled events** — Only 20 CAMEO base codes are mapped to ConflictEventTypes. Unmapped codes fall through to generic "assault" or "ground_combat", losing important distinctions (missile strikes, drone ops, naval engagements).
3. **No confidence signal** — Unlike the news pipeline (Phase 21.1 NLP scoring), events carry no quality/reliability metric. Low-signal single-source events are weighted equally with well-corroborated multi-source incidents.

## Scope

Server-side only. All changes in `server/adapters/gdelt.ts` and new `server/lib/eventScoring.ts`. No client-side changes — two additive fields (`geoPrecision`, `confidence`) ship on each event for future client use.

## Design

### 1. Geo-validation (1a + 1c)

#### 1a: Text-geo cross-validation

During `parseAndFilter`, cross-reference `ActionGeo_FullName` against `ActionGeo_CountryCode`:

- GDELT `ActionGeo_FullName` uses the format `"City, Region, Country"`. Parse only the **last comma-delimited segment** to extract the location country — do NOT scan the entire string for country names (which would falsely match actor references like "US forces in Baghdad").
- Build a set of known non-Middle-East country names (e.g., "United States", "United Kingdom", "Russia", "China", "France" — ~30 most common in GDELT data).
- If the last segment of `ActionGeo_FullName` matches a non-ME country name, discard the event. This catches "New York, United States" with FIPS "IS" but preserves "US airstrike in Baghdad, Iraq" with FIPS "IZ".
- Additionally, build a reverse lookup of FIPS code → expected country names for the 16 Middle East countries. If the last segment names a country that contradicts the FIPS code (e.g., FullName ends with "Turkey" but FIPS = "IS"), discard.
- Edge case: FullName with no commas (single-segment) — skip cross-validation, rely on existing FIPS filter.

#### 1c: City-centroid detection

Maintain a table of ~30 major city centroids in the Middle East region:

```
Tehran (35.6892, 51.3890), Baghdad (33.3152, 44.3661), Damascus (33.5138, 36.2765),
Tel Aviv (32.0853, 34.7818), Jerusalem (31.7683, 35.2137), Riyadh (24.7136, 46.6753),
Beirut (33.8938, 35.5018), Amman (31.9454, 35.9284), Kabul (34.5553, 69.2075),
Islamabad (33.6844, 73.0479), Ankara (39.9334, 32.8597), Sana'a (15.3694, 44.1910),
Doha (25.2854, 51.5310), Kuwait City (29.3759, 47.9774), Muscat (23.5880, 58.3829),
Manama (26.2285, 50.5860), Abu Dhabi (24.4539, 54.3773), Dubai (25.2048, 55.2708),
Aden (12.7855, 45.0187), Basra (30.5085, 47.7804), Mosul (36.3350, 43.1189),
Aleppo (36.2021, 37.1343), Homs (34.7324, 36.7137), Isfahan (32.6546, 51.6680),
Tabriz (38.0962, 46.2738), Jeddah (21.4858, 39.1925), Medina (24.4672, 39.6024),
Haifa (32.7940, 34.9896), Gaza City (31.5017, 34.4668), Karachi (24.8607, 67.0011)
```

- When an event's lat/lng matches a known centroid within ±0.01 degrees (~1.1km), set `geoPrecision: 'centroid'`.
- Otherwise set `geoPrecision: 'precise'`.
- This field does not filter — it feeds into the confidence score (Section 3).

### 2. Expanded CAMEO classification (2a + 2c)

#### 2a: Expanded BASE_CODE_MAP

Grow `BASE_CODE_MAP` from 20 entries to cover all conflict-relevant CAMEO base codes in the 180-200 range (root codes 18, 19, 20 — the existing `CONFLICT_ROOT_CODES` filter is unchanged). Key improvements:

- Finer sub-type distinctions within the existing 11 ConflictEventTypes
- Explicit mappings for all known base codes so fewer events fall to `ROOT_FALLBACK`
- No new ConflictEventTypes added

#### 2c: Goldstein sanity check

After CAMEO classification, cross-check the assigned type against the Goldstein scale:

- **Goldstein = 0 (missing/invalid):** Treat as unknown — skip reclassification entirely. In confidence scoring, assign a neutral 0.5 for the Goldstein consistency signal.
- **Positive Goldstein on conflict root codes:** Treat as data error — skip reclassification (same as Goldstein = 0).

Expected Goldstein ceilings per ConflictEventType:

| Type | Ceiling | Downgrade Target |
|------|---------|-----------------|
| `mass_violence` | -7 | `assault` |
| `wmd` | -7 | `assault` |
| `airstrike` | -5 | `shelling` |
| `bombing` | -5 | `shelling` |
| `ground_combat` | -4 | `assault` |
| `shelling` | -4 | `assault` |
| `assassination` | -3 | `assault` |
| `abduction` | -3 | `assault` |
| `assault` | -1 | (no downgrade — already lowest) |
| `blockade` | -1 | `assault` |
| `ceasefire_violation` | -1 | `assault` |

If an event's Goldstein score exceeds its type's ceiling by more than 3 points, reclassify to the downgrade target.

### 3. Composite confidence score (3a)

New module `server/lib/eventScoring.ts` exports `computeEventConfidence()`.

#### Signals and weights

| Signal | Weight | Logic |
|--------|--------|-------|
| Media coverage | 0.30 | `log2((numMentions ?? 1) + 1) / log2(50)` clamped to 1.0 |
| Source diversity | 0.20 | `log2((numSources ?? 1) + 1) / log2(15)` clamped to 1.0 |
| Actor specificity | 0.20 | Both actor **names** non-empty = 1.0, one non-empty = 0.5, both empty = 0.0 |
| Geo precision | 0.15 | `'precise'` = 1.0, `'centroid'` = 0.3 |
| Goldstein consistency | 0.15 | 1.0 if within expected range; linear decay outside; 0.5 if Goldstein = 0 or positive (unknown) |

- `undefined` numMentions/numSources default to 1 (single source assumed), producing a low but non-NaN contribution.
- Actor specificity checks Actor1Name/Actor2Name (columns 6/16), not country codes.

Returns a 0-1 `confidence` score stored on each `ConflictEventEntity.data`.

#### Threshold

- Configurable via `eventConfidenceThreshold` in `AppConfig` (env var `EVENT_CONFIDENCE_THRESHOLD`).
- Default: `0.15` — effectively a no-op at launch.
- Events below threshold are discarded after scoring.
- Threshold of `0.0` means nothing is ever filtered.

### 4. Data model changes

Additive **optional** fields on `ConflictEventEntity.data`:

```typescript
geoPrecision?: 'precise' | 'centroid'
confidence?: number  // 0-1 composite score
```

Optional because:
- Existing cached events in Redis (`events:gdelt`) lack these fields — they'll naturally get replaced as fresh events come in, but during the transition window old and new events coexist.
- Client code should treat missing fields as "unscored" (no special handling needed this phase).

### 5. Pipeline architecture

Split `parseAndFilter` into a two-phase pipeline to resolve the normalization timing issue:

**Phase A — Raw row filtering (operates on `string[]` columns):**
1. Existing filters (root code, country code, actor presence, lat/lng validity)
2. **Geo cross-validation (1a)** — discard misplaced events
3. Existing deduplication (date + EventCode + lat/lng, highest mentions wins)

**Phase B — Normalize and score (operates on `ConflictEventEntity`):**
4. `normalizeGdeltEvent()` — creates entity objects from surviving rows
5. **CAMEO classification (2a)** — expanded mapping (already runs inside normalizeGdeltEvent)
6. **Goldstein sanity check (2c)** — reclassify outliers on entity objects
7. **Centroid detection (1c)** — set `geoPrecision` on entity
8. **Confidence scoring (3a)** — compute and attach `confidence`
9. **Threshold filter** — discard below configurable threshold

This preserves the existing dedup structure (operates on raw columns before normalization) while allowing the scoring pipeline to write directly to entity objects.

## Out of scope

- Client-side confidence filter UI (slider, dimming) — deferred to future phase
- New ConflictEventTypes — existing 11 types remain
- ACLED integration — preserved adapter remains dormant
- News pipeline changes — Phase 21.1 NLP scoring is separate
- Source URL fetching for NLP reclassification — too much latency
- Expanding `CONFLICT_ROOT_CODES` beyond 18/19/20

## Testing

- **Geo cross-validation:** Known misplacement examples (NYC→Israel, "US forces in Baghdad" preserved, single-segment FullName passthrough)
- **Geo false-positive regression:** Legitimate events with non-ME actor references that should NOT be discarded
- **Expanded CAMEO mapping:** Every base code has a test asserting its ConflictEventType
- **Goldstein sanity check:** Boundary cases, Goldstein = 0 (skip), positive Goldstein (skip), exact threshold (+3 above ceiling)
- **Confidence scoring:** Known input → expected output, undefined numMentions/numSources (default to 1), Goldstein = 0 (neutral 0.5), boundary at exact threshold (0.15)
- **Integration test:** Full `parseAndFilter` with synthetic CSV rows covering: valid event, misplaced event (discarded), centroid event (flagged), Goldstein outlier (reclassified), low-confidence event (threshold behavior)
- **Backfill integration:** Verify backfill path produces scored events
- **Regression:** Events that currently pass `parseAndFilter` should still pass after changes (run against snapshot of real GDELT data)
