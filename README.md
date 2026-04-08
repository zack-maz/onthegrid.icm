# Iran Conflict Monitor

> **Real-time Iran conflict intelligence dashboard. Numbers over narratives.**

![Hero](docs/hero.gif)

A personal open-source intelligence (OSINT) tool that fuses ten upstream public
data feeds into a single 2.5D map of the Greater Middle East. Flights, ships,
GDELT conflict events, OpenStreetMap infrastructure, news clusters, oil market
prices, weather, water stress, political alignment, and ethnic distribution —
all updated live, all gated through the same cache-first serverless pipeline.
Built to answer one question: _what is actually happening around the Strait of
Hormuz right now, quantitatively?_

---

**Live demo:** <https://irt-monitoring.vercel.app>

> Please be gentle. This is a single-user Redis budget (Upstash free tier, ~92%
> of the monthly command ceiling already in use). The live demo is protected by
> a 6 req/min per-IP baseline rate limit on top of per-endpoint limiters — a
> burst of curl loops will trip it fast. `robots.txt` disallows `/api/*` to
> keep crawlers off the upstream budget.

---

## Engineering

[![CI](https://github.com/zack-maz/onthegrid.icm/actions/workflows/ci.yml/badge.svg)](https://github.com/zack-maz/onthegrid.icm/actions/workflows/ci.yml)
[![CodeQL](https://github.com/zack-maz/onthegrid.icm/actions/workflows/codeql.yml/badge.svg)](https://github.com/zack-maz/onthegrid.icm/actions/workflows/codeql.yml)
[![Coverage](https://codecov.io/gh/zack-maz/onthegrid.icm/branch/main/graph/badge.svg)](https://codecov.io/gh/zack-maz/onthegrid.icm)
![Tests](https://img.shields.io/badge/tests-1277%20passing-success)
![Type Coverage](https://img.shields.io/badge/type--coverage-97%25-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Node](https://img.shields.io/badge/node-22.x-green)
[![API Spec](https://img.shields.io/badge/API-OpenAPI%203.0-orange)](server/openapi.yaml)

**1277 passing tests across 101 files.** TypeScript strict mode with
`noUncheckedIndexedAccess` on the server tsconfig. Type coverage gated at 97%
in CI (ratchet floor, 99% aspirational). Pino structured logging with secret
redaction proven by a write-stream sink test. Graceful degradation against
Upstash Redis failure proven by a chaos test that simulates Redis death and
asserts all 8 cached routes return 200/degraded or 502/503 but **never** 500.
A 2000ms `Promise.race` timeout caps hung Upstash calls so they can't freeze a
Vercel lambda. Pre-commit hooks lint, format, and scan for leaked secrets with
gitleaks. CodeQL runs on every PR plus weekly on `main`.

See the [Engineering deep dive](#engineering-deep-dive) section below for test
matrices, coverage details, and the honest tech-debt accounting.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Data Sources](#data-sources)
- [Visualization Layers](#visualization-layers)
- [Screenshots](#screenshots)
- [Engineering Deep Dive](#engineering-deep-dive)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [What I Learned / What I'd Do Differently](#what-i-learned--what-id-do-differently)
- [License](#license)

---

## Features

- **Live entity tracking** — flights (3 pluggable sources: OpenSky, ADS-B
  Exchange, adsb.lol), ships (AISStream), conflict events (GDELT v2)
- **Key infrastructure sites** — nuclear, naval, oil, airbase, port facilities
  sourced from OpenStreetMap via Overpass, attack-status cross-referenced
  against recent GDELT events within 5 km
- **News feed** — GDELT DOC 2.0 + 5 RSS feeds (BBC, Al Jazeera, Tehran Times,
  Times of Israel, Middle East Eye) with Jaccard dedup/clustering and
  relevance-scored keyword filtering
- **Notification center** — severity-scored alerts correlating GDELT events
  with news headlines (temporal + geographic/keyword matching), proximity
  warnings for flights/ships within 50 km of key sites
- **Oil markets tracker** — Brent, WTI, XLE, USO, XOM with sparkline charts
  (Yahoo Finance, 60 s polling)
- **Seven visualization layers** — geographic (elevation contours + color
  relief), weather (temperature heatmap + wind barbs), threat density (custom
  GLSL radial gradient shader over BFS-clustered events), political alignment
  (Natural Earth faction fills + disputed territories), ethnic distribution
  (GeoEPR 2021 with FillStyleExtension hatching), water stress (WRI Aqueduct
  4.0 + Open-Meteo precipitation anomaly at named facilities), satellite
  (deferred)
- **Advanced search** — Cmd+K modal with ~25 tag prefixes (`type:`, `near:`,
  `country:`, `callsign:`, `cameo:`, `severity:`, etc.), implicit-OR
  evaluation, bidirectional sync between search bar and sidebar filter
  toggles, two-stage autocomplete with live entity counts
- **Date-range filtering** — custom dual-thumb slider with minute/hour/day
  granularity toggle; default 24 h window when no custom range is active
- **Detail panels** — 360 px right-side slide-out with per-entity data in dual
  units (ft/m, kn/m-s, ft-min/m-s), flash-on-change animations, lost-contact
  grayscale state, browser-like back navigation stack with slide animations

---

## Quick Start

**Prerequisites:**

- **Node 22.x** (pinned in `package.json` engines)
- **gitleaks** _(recommended)_ — `brew install gitleaks` for pre-commit secret
  scanning (the hook fails open without it, so this is optional for local dev
  but strongly recommended before pushing)
- **Upstash Redis account** _(optional)_ — the server runs with graceful
  degradation against in-memory cache when Upstash credentials are absent, so
  you can develop and test without it

**Clone and install:**

```bash
git clone https://github.com/zack-maz/onthegrid.icm.git
cd onthegrid.icm
npm install
```

The `prepare` script auto-installs husky hooks on `npm install`, so pre-commit
linting, formatting, and secret scanning is live from the first commit.

**Configure environment:**

```bash
cp .env.example .env.local
# Edit .env.local — all vars are optional for local dev, but the server will
# log a warning and degrade gracefully when each is absent. See the
# `scripts/check-env-example.ts` drift checker for the authoritative list.
```

**Run dev server (frontend + backend concurrently):**

```bash
npm run dev
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:3001>
- Vite proxies `/api/*` from 5173 to 3001

**Run tests:**

```bash
npx vitest run              # full suite (1277 tests across 101 files)
npx vitest run src/         # frontend only
npx vitest run server/      # server only
npx vitest run --coverage   # with coverage report
```

**Typecheck + type coverage gate:**

```bash
npm run typecheck           # tsc -b + type-coverage at 97% floor
```

**Lint + format:**

```bash
npm run lint                # eslint
npm run format:check        # prettier check
npm run format              # prettier write
```

**Env drift check:**

```bash
npx tsx scripts/check-env-example.ts    # asserts .env.example matches server/config.ts
```

---

## Architecture

| Layer         | Technology                                                                        |
| ------------- | --------------------------------------------------------------------------------- |
| Frontend      | React 19, TypeScript 5.9 (strict), Vite 6, Tailwind CSS v4 (CSS-first `@theme`)   |
| State         | Zustand 5 (curried `create<T>()()` pattern, selector-based subscriptions)         |
| Map rendering | Deck.gl + MapLibre GL JS (2.5 D terrain, AWS Terrarium DEM, custom GLSL shaders)  |
| Backend       | Express 5 (serverless functions on Vercel, `createApp()` factory)                 |
| Cache         | Upstash Redis (REST-based) with in-memory fallback on failure                     |
| CDN           | Vercel Edge with per-endpoint `Cache-Control: max-age=0, s-maxage=N`              |
| Security      | Helmet CSP, per-endpoint sliding-window rate limits, public baseline tier         |
| Validation    | Zod input schemas on queries, Zod output schemas via `sendValidated<S>` helper    |
| Observability | Pino structured JSON with `redact` config for secrets/PII, `X-Request-ID` trace   |
| Monitoring    | `/health` endpoint with per-source freshness + Redis latency, Vercel cron warming |
| Build         | Vite (frontend) + tsup (server bundle) + `tsc -b` (typecheck) + `type-coverage`   |

**High-level data flow:**

```
Browser (React SPA, port 5173)
    │
    │  polls /api/{flights,ships,events,news,sites,markets,weather,water}
    ▼
Vercel Edge (CDN cache — s-maxage per endpoint)
    │
    ▼
Express createApp() (serverless function)
    │
    ├── rateLimiters.public (6 req/min baseline)
    ├── rateLimiters.<endpoint> (per-endpoint ceilings)
    ├── cacheGetSafe() → Upstash Redis (CacheEntry<T>)
    │       │
    │       │ hit (fresh)           hit (stale)            miss
    │       ▼                       ▼                      ▼
    │   return cached           serve + mark stale     upstream fetch
    │                                                      │
    │                                                      ▼
    │                                          8 upstream adapters
    │                                          (see Data Sources table)
    │                                                      │
    │                                                      ▼
    │                                          cacheSetSafe() + sendValidated()
    │
    └── Upstash failure → withTimeout(Promise.race, 2000ms) → in-memory fallback
```

_Full mermaid diagrams live in `docs/architecture/` — see Plan 26.4-05
output: system-context, data-flows-per-source, frontend component graph,
deployment topology, full type/class ontology._

---

## Data Sources

| Source                              | Data                    | Polling   | Auth               |
| ----------------------------------- | ----------------------- | --------- | ------------------ |
| OpenSky / ADS-B Exchange / adsb.lol | Flights (ADS-B)         | 5–260 s   | optional OAuth2    |
| AISStream.io                        | Ships (AIS, WebSocket)  | 30 s      | API key (optional) |
| GDELT v2 events export              | Conflict events (CAMEO) | 15 min    | none (public)      |
| GDELT DOC 2.0 + 5 RSS feeds         | News articles           | 15 min    | none (public)      |
| Overpass / OpenStreetMap            | Infrastructure sites    | 24 h      | none (public)      |
| WRI Aqueduct 4.0 + Open-Meteo       | Water stress + precip   | 6 h / 24h | none (public/CSV)  |
| Yahoo Finance (unofficial)          | Oil markets             | 60 s      | none (public)      |
| Open-Meteo                          | Weather grid            | 10 min    | none (public)      |
| Natural Earth 110m/10m              | Political + disputed    | static    | bundled GeoJSON    |
| GeoEPR 2021 (ETH Zurich)            | Ethnic zones            | static    | bundled GeoJSON    |
| Nominatim                           | Reverse geocoding       | on-demand | none (cache 30 d)  |

All data routes share a common `CacheResponse<T>` envelope (`{data, stale,
lastFresh, source}`) and the same cache-first pattern. See
[`server/openapi.yaml`](server/openapi.yaml) for the authoritative API
contract.

---

## Visualization Layers

| Layer          | Description                                                                        | Screenshot                                         |
| -------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| Geographic     | Elevation color-relief, maplibre-contour lines, feature labels                     | _(active in every shot)_                           |
| Weather        | Open-Meteo temperature heatmap (bilinear-interpolated canvas) + wind barbs         | _(active in hero GIF)_                             |
| Threat density | BFS-clustered GDELT events with custom GLSL radial gradient + P90 normalization    | [screenshot](docs/screenshots/threat-density.png)  |
| Political      | Natural Earth faction fills (US-aligned blue / Iran-aligned red / neutral gray)    | [screenshot](docs/screenshots/political-layer.png) |
| Ethnic         | 10 ethnic zones (GeoEPR 2021) with `FillStyleExtension` hatching + overlap stripes | [screenshot](docs/screenshots/ethnic-layer.png)    |
| Water stress   | Facility-level stress via WRI Aqueduct + precipitation anomaly, 6 rivers as lines  | [screenshot](docs/screenshots/water-stress.png)    |
| Satellite      | ArcGIS World Imagery — _deferred to v1.4_                                          | _(coming soon)_                                    |

Entity filters (flights, ships, events, sites) operate independently from
visualization layer toggles. Layer stacking is zoom-dependent: threat clusters
render below entities below zoom 9, above them at zoom ≥ 9.

---

## Screenshots

- **Threat density:** [docs/screenshots/threat-density.png](docs/screenshots/threat-density.png)
- **Political layer:** [docs/screenshots/political-layer.png](docs/screenshots/political-layer.png)
- **Ethnic distribution:** [docs/screenshots/ethnic-layer.png](docs/screenshots/ethnic-layer.png)
- **Water stress:** [docs/screenshots/water-stress.png](docs/screenshots/water-stress.png)
- **Detail panel:** [docs/screenshots/detail-panel.png](docs/screenshots/detail-panel.png)
- **Search modal (Cmd+K):** [docs/screenshots/search-modal.png](docs/screenshots/search-modal.png)

---

## Engineering Deep Dive

This section is deliberately verbose. If you're evaluating this as a work
sample, this is the part worth reading carefully.

### Test Suite

| Metric              | Value                                             |
| ------------------- | ------------------------------------------------- |
| Total tests         | **1277 passing** (8 skipped)                      |
| Test files          | 101                                               |
| Frontend tests      | ~870                                              |
| Server tests        | ~400                                              |
| Duration (cold)     | ~38 s (vitest forks pool)                         |
| Coverage (baseline) | lines 66 / funcs 69 / branches 53 / statements 65 |
| Type coverage       | **97.05%** (7977 / 8219 typed)                    |

Coverage thresholds are locked at the current baseline as a regression
ratchet in `vite.config.ts` — a `TODO` comment tracks the aspirational 80 %
target. Type coverage is locked at 97 as a hard CI gate: any `any`
regression fails the build. The remaining 3 % of "untyped" expressions are
almost entirely deck.gl v9 and maplibre 5 type-cast leaks in layer config —
tracked for a future cleanup pass.

### Pre-commit Hooks

- **husky v9 + lint-staged v15** — eslint `--fix` + prettier `--write` on
  staged TS/TSX files; prettier-only on JSON/MD/CSS/YAML
- **gitleaks** — scans staged files for leaked secrets; hook fails open if
  the binary is missing (documented in Quick Start)
- **Target runtime:** < 2 s per commit (measured ~1.5 s on a fresh file)
- **tsc and vitest are NOT run in pre-commit** — CI catches those

### CI / CD (GitHub Actions)

- **`.github/workflows/ci.yml`** — runs on every PR and push to `main`. Three
  jobs in parallel:
  - `lint-and-typecheck` — eslint, prettier-check, `tsc -b`, type-coverage,
    knip (advisory, continue-on-error)
  - `test` — `vitest run --coverage` + codecov upload
  - `audit` — `npm audit --audit-level=high`
- **`.github/workflows/codeql.yml`** — CodeQL v3 analysis (JavaScript +
  TypeScript) on every PR, every push to `main`, and a weekly Monday 06:00
  UTC scheduled run
- **Vercel preview deploys** — enabled via the Vercel ↔ GitHub integration
  (no YAML), comment bot posts preview URL on every PR within ~60 s
- **Concurrency** — `ci-${{ github.ref }}` with `cancel-in-progress` cancels
  stale PR runs automatically

### Palantir-Grade Hardening (Phase 26.4-03)

These are the gaps that Phase 26.3 left open and Phase 26.4 closed:

1. **Log redaction** — Pino `redact` config strips `authorization`, `cookie`,
   `x-api-key`, `set-cookie`, wildcard `*.UPSTASH_*` / `*.OPENSKY_*` /
   `*.AISSTREAM_*` / `*.ADSB_*` tokens, plus production-only `req.ip` and
   `req.remoteAddress`. Proven by
   [`server/__tests__/lib/logger-redaction.test.ts`](server/__tests__/lib/logger-redaction.test.ts) —
   captures write-stream output and asserts sensitive fields are `[REDACTED]`
   plus an anti-leak stringify check that original secret strings appear
   nowhere in the JSON.
2. **Redis death chaos test** —
   [`server/__tests__/resilience/redis-death.test.ts`](server/__tests__/resilience/redis-death.test.ts)
   boots the real Express app via supertest, mocks `@upstash/redis` to throw
   on every call, and asserts all 8 cached routes + `/health` return 200
   degraded or 502/503 — **never 500**. Exposed two real production
   resilience gaps, both fixed:
   - `events.ts` had direct `redis.get/set` calls in the backfill cooldown
     tracking — now wrapped in try/catch via `shouldBackfill()` and
     `recordBackfillTimestamp()` helpers
   - `cacheGetSafe` / `cacheSetSafe` caught sync throws but NOT hung Upstash
     calls (client retries internally on missing URL, blocks indefinitely)
     — fixed by adding a 2000 ms `Promise.race` timeout wrapper in
     [`server/cache/redis.ts`](server/cache/redis.ts). This is a real
     production hardening, not test-only scaffolding.
3. **Zod at output boundary** — `sendValidated<S>(res, schema, payload)`
   helper in
   [`server/middleware/validateResponse.ts`](server/middleware/validateResponse.ts)
   with dev-throw / prod-warn semantics. Wired into flights, events, water
   routes as proof-of-concept (3 of 14; the remaining 11 are a mechanical
   follow-up).
4. **Live demo rate limit hardening (Phase 26.4-04)** —
   `rateLimiters.public` baseline tier (6 req/min, prefix `ratelimit:public`)
   runs on every `/api/*` request before per-endpoint limiters, protecting
   the Redis command budget from scraper abuse once the demo URL is
   published. `public/robots.txt` disallows `/api/*` and `/health` so
   well-behaved crawlers never touch upstream APIs.

### OpenAPI Contract

[`server/openapi.yaml`](server/openapi.yaml) — 1164-line hand-written
OpenAPI 3.0.3 spec documenting every route, the `CacheResponse<T>`
envelope, the canonical error envelope, and the sliding-window rate limit
policies per endpoint. Not generated from code — hand-curated so the
editorial descriptions are portfolio-readable. Response schemas are
cross-validated at runtime via `sendValidated` for drift detection between
the spec and the implementation.

### Graceful Degradation (3 bullets)

- **In-memory fallback:** `cacheGetSafe` / `cacheSetSafe` catch every
  Upstash failure (throws, timeouts, missing credentials) and transparently
  fall through to a process-local `Map` with the same `CacheEntry<T>`
  semantics. The client never sees the transition.
- **Stale serving:** when an upstream adapter fails on cache miss, the
  server serves the most recent cached copy with `stale: true` instead of
  propagating the error. The UI reads `stale` and degrades its connection
  dot from green to yellow.
- **`/health` degraded state:** `/health` reports
  `{status: 'degraded', redis: false}` when Upstash is unreachable while
  still returning HTTP 200 so Vercel cron doesn't retry unnecessarily.

---

## Environment Variables

<details>
<summary>Click to expand environment variable reference</summary>

| Variable                   | Required | Description                                                    |
| -------------------------- | :------: | -------------------------------------------------------------- |
| `UPSTASH_REDIS_REST_URL`   |   no\*   | Upstash Redis REST endpoint; falls back to in-memory cache     |
| `UPSTASH_REDIS_REST_TOKEN` |   no\*   | Upstash Redis auth token; falls back to in-memory cache        |
| `CORS_ORIGIN`              |    no    | CORS origin (defaults to `*`)                                  |
| `PORT`                     |    no    | Server port (defaults to 3001)                                 |
| `OPENSKY_CLIENT_ID`        |    no    | OpenSky OAuth2 client ID; flights work via adsb.lol without it |
| `OPENSKY_CLIENT_SECRET`    |    no    | OpenSky OAuth2 client secret                                   |
| `ADSB_EXCHANGE_API_KEY`    |    no    | ADS-B Exchange RapidAPI key                                    |
| `AISSTREAM_API_KEY`        |    no    | AISStream WebSocket API key; ships layer disabled without it   |
| `NODE_ENV`                 |    no    | `development` \| `production` \| `test`                        |
| `VERCEL`                   |    no    | Set by Vercel runtime; toggles compression and rate limiters   |

\* _Server runs with graceful degradation when Upstash credentials are
absent — all cached routes fall back to in-memory cache. Authoritative list
lives in [`server/config.ts`](server/config.ts); drift is checked by
[`scripts/check-env-example.ts`](scripts/check-env-example.ts)._

</details>

---

## Testing

```bash
# Full suite (1277 tests)
npx vitest run

# With coverage report (lcov + HTML)
npx vitest run --coverage

# Specific scope
npx vitest run src/            # frontend
npx vitest run server/         # server
npx vitest run -t "redaction"  # by test name match

# Typecheck + type coverage gate (chained via `npm run typecheck`)
npm run typecheck

# Lint + format
npm run lint
npm run format:check
```

**Mocks and fixtures:**

- `src/test/__mocks__/` — WebGL-dependent library mocks for jsdom (maplibre,
  deck.gl)
- `server/__tests__/fixtures/` — GDELT CSV fixtures, GeoJSON snippets, etc.
- Rate limiter is mocked as pass-through in route tests via
  `vi.mock('../../middleware/rateLimit.js', ...)`

**Smoke test against production:**

```bash
npx tsx scripts/smoke-test.ts https://irt-monitoring.vercel.app
```

---

## What I Learned / What I'd Do Differently

This is the subjective section — the honest retrospective a hiring manager
actually reads to assess judgment. I'm not going to pretend everything went
smoothly.

### Phase 26.2: the NLP approach I had to scrap

Phase 26.2 was supposed to be "Conflict Geolocation Improvement." The idea
was to use NLP entity extraction (via `compromise`, a browser-compatible NLP
library) on GDELT event text to re-derive missing or wrong coordinates, then
validate them against country polygons. I built the lexicon — 22 Middle East
country ISO codes bridged to FIPS 10-4, a multi-word city tokenizer for names
like "Deir ez-Zor" and "Mazar-i-Sharif," a conflict actor lexicon
(Houthi/Hamas/Hezbollah), a place-country match gate, a confidence threshold
of 0.38, and CAMEO 182/190 hard-exclusions.

**It didn't work.** Not because any individual piece was broken — each unit
had its passing test — but because the whole stack was patching a fundamentally
bad geocoding source with more heuristics. GDELT's `ActionGeo` fields are
noisy in ways that NLP can't fix: the same event gets tagged with different
actor countries on consecutive updates, centroid fallback values
(`ActionGeo_Type = 3/4`) pollute the signal, and the underlying CAMEO
taxonomy doesn't distinguish "Iran-involved" from "Iran-affecting." I was
adding epicycles to a wrong model.

I scrapped the whole phase and reverted the code. The commit history shows
it: Phase 26.2 was deleted wholesale, `parseAndFilter` reverted to
synchronous, the confidence threshold rolled back from 0.38 to 0.35, CAMEO
exclusions reset to the original `['180', '192']` pair. Two weeks of work,
in the bin.

**What I'd do differently:** start with the source data quality question,
not the inference layer. Before writing a single line of NLP code, I should
have quantified how bad GDELT's geolocation actually is — sampled 1000 events,
manually verified coordinates, and measured the false positive rate at each
confidence threshold. If I had done that first, I would have seen that the
noise floor was above any threshold I could realistically set, and spent the
two weeks on _filtering_ GDELT (excluding noisy CAMEO codes, requiring
multi-source corroboration) instead of _rescuing_ it with NLP. "Kill your
darlings" is cheap advice; actually killing a phase you've been executing for
a week is hard. I left the tech debt markers (`TODO(26.2)` in the hardcoded
CAMEO tables) in place so the next person — present-me, in a few months —
can see the honest accounting.

### I started with horizontal layers, ended with vertical slices

My first three phases were classic horizontal architecture: get the map
working, get the entities rendering, get the data flowing. That was fine
through Phase 5. But starting at Phase 13 (Serverless Cache Migration), I
realized I had been _avoiding_ the hard integration work — the pieces all
existed, but they weren't gelled.

From Phase 17 (Notification Center) onward I flipped the planning pattern to
vertical slices: one plan = one feature, across the full stack, including the
UI it renders in. That's how Phase 17 shipped a proximity alert overlay, a
severity scoring library, a news-to-event matcher, _and_ a notification bell
dropdown in a single plan. In retrospect, I should have been thinking that
way from Phase 10 at the latest.

### Redis budget management is not a deployment problem, it's a day-1 design problem

The Upstash free tier allows a fixed number of commands per month. By Phase
25 I was at 80 % of the monthly ceiling and panicking about Phase 26 (Water
Stress) adding another polling source. I had to retrofit per-endpoint
`Cache-Control` headers, convert AISStream from a persistent WebSocket to an
on-demand connect-collect-close pattern, and add a GDELT backfill cooldown
gate — all to buy back command budget.

If I had designed with a fixed per-phase command budget from day 1 — "you
get N commands per minute, and that's it" — I would have pushed harder on
CDN caching (`s-maxage` on Vercel Edge) earlier, and I would have put the
proximity alert and notification severity computations on the client side
from the start instead of migrating them later.

### TypeScript strict mode was worth the pain

`noUncheckedIndexedAccess` on the server tsconfig caught at least three
real bugs during Phase 26.3 — array accesses that would have been `undefined`
at runtime. I enabled it late and had to clean up 40+ call sites, which
sucked. I should have enabled it at Phase 1. I didn't enable it on the client
tsconfig because deck.gl v9 and maplibre 5 type definitions have loose runtime
contracts that would cascade through every layer factory — pragmatism over
purity.

### What this project is NOT

It is not a production intelligence system. It has no authentication, no
multi-tenancy, no persistent storage, no historical replay, no mobile app,
no real-time chat, no classified or paid intelligence feeds. It is a
single-user personal tool that exists to answer a narrow question — _what's
moving around the Strait of Hormuz right now?_ — from public data sources
only. The portfolio value is in the engineering rigor around that narrow
goal, not in the breadth of features.

---

## License

Private — personal project. Source code is provided as a portfolio work
sample. All third-party data sources are used under their respective public
terms of service.

---

_Phase 26.4-04 — Portfolio presentation pass. Last updated 2026-04-08._
