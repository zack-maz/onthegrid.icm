# Stack Research

**Domain:** Production-hardening of a shipped real-time intelligence dashboard (React 19 + Vite 6 + Deck.gl 9 + MapLibre 5 + Tailwind v4 + Express 5 on Vercel Pro / Fluid Compute + Upstash Redis)
**Researched:** 2026-06-09
**Confidence:** HIGH

## Bottom Line Up Front

**v2.0 Final Hardening needs ZERO new runtime dependencies and ZERO new dev dependencies.**

All six target features are either (a) bug-fixes / debugging of existing internal logic, (b) UI redesign within the existing Tailwind v4 + hand-rolled component system, or (c) load-test re-runs against the _already-installed_ k6 (`v1.7.0`) + Playwright (`@playwright/test@^1.58.2`) harness from v1.2/v1.4. The strongest recommendation in this document is a negative one: **do not add libraries.** Every feature maps to code the project already owns.

The remainder of this file justifies that conclusion feature-by-feature and records the version checks that back it.

## Recommended Stack

### Core Technologies (all PRE-EXISTING — no change)

| Technology                  | Installed Version                           | Purpose for v2.0                                             | Why it stays                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| k6                          | `v1.7.0` (homebrew, `/opt/homebrew/bin/k6`) | ~100-user 1–300 VU sweep (feature 4)                         | Current 1.x line; `k6/http` + `ramping-vus` scenarios API is NOT deprecated. Existing `scripts/load-test.js` already uses the modern scenario/executor pattern.                                               |
| @playwright/test            | `^1.58.2`                                   | Browser-side validation during load (feature 4)              | Already wired as `scripts/load-test.spec.ts`. k6-API + Playwright-browser is the canonical 2026 split (k6 measures backend RPS/latency; Playwright asserts the React app stays functional + Core Web Vitals). |
| Tailwind CSS v4             | `^4.2.1` (`@tailwindcss/vite` `^4.2.1`)     | Dashboard subtab readability redesign (feature 3)            | CSS-first `@theme` already holds the design-token source of truth (`src/styles/app.css`). Redesign is utility-class + layout work, not a new styling system.                                                  |
| transliteration             | `2.6.1` (pinned, exact)                     | Water admission-gate debugging (feature 1)                   | Already the romanization engine feeding `name:en` _before_ the Latin-label gate (`server/adapters/overpass-water.ts`). Debugging the drop bug works _within_ this path — no replacement.                      |
| vitest                      | `^4.1.0` + `@vitest/coverage-v8` `^4.1.2`   | Nyquist coverage backfill for Phases 39/40 (feature 5)       | Coverage harness already present; backfill is writing tests, not adding tooling.                                                                                                                              |
| pino / Zod / @upstash/redis | `^10.3.1` / `^3.25.76` / `^1.37.0`          | Cron first-tick verification, rate-limiter block (feature 5) | All hardening primitives (logger, config validation, Redis sidecars) already in place.                                                                                                                        |

### Supporting Libraries

**None required.** The features decompose entirely onto existing modules:

| Feature                           | Existing module(s) that own it                                                                                                                                                                                              | New dep? |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Water filter fix                  | `server/adapters/overpass-water.ts` (`hasLatinLabel`, `computeAdmissionDecision`, `GENERIC_OSM_NAME_RE`, desalination D-03 bypass, romanization-before-gate), `server/lib/waterSnapshot.ts`, `scripts/audit-water-names.ts` | No       |
| Event ghost links + events subtab | `server/lib/urlLiveness.ts` (probe sweep, HEAD-then-GET, `attemptCount` gate, terminal-dead TTL tiers, count sidecar), `src/components/ui/DevApiStatus.tsx` (events subtab)                                                 | No       |
| Dashboard subtab cleanup          | `src/components/ui/DevApiStatus.tsx` + sibling `*Block.tsx` (`BudgetBlock`, `FlightRecorderBlock`, `actorQuality` block), `src/components/markets/Sparkline.tsx`, Tailwind v4 `@theme` tokens                               | No       |
| ~100-user load test               | `scripts/load-test.js` (k6), `scripts/load-test.spec.ts` (Playwright)                                                                                                                                                       | No       |
| General hardening                 | `server/middleware/rateLimiter.ts`, cron handlers + `cron:lastTick:*` keys, `server/lib/healthSources.ts`, vitest                                                                                                           | No       |
| Docs cleanup                      | markdown only (`markdown-link-check`, `@redocly/cli` already present)                                                                                                                                                       | No       |

### Development Tools (all PRE-EXISTING)

| Tool                                                   | Purpose                             | Notes                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| k6 `v1.7.0`                                            | Backend load generation             | Run `k6 run scripts/load-test.js --env BASE_URL=https://otg-iran-monitor.vercel.app --out json=load-test-results/results.json`. Existing `RAMP_STAGES` already does 0→25→100→0; widen to a 1→300 sweep per the feature-4 spec by editing the `stages` array — no tooling change. |
| @playwright/test `^1.58.2`                             | Browser validation under load       | Run concurrently with k6 (pattern already documented in the spec file header).                                                                                                                                                                                                   |
| @vitest/coverage-v8 `^4.1.2`                           | Nyquist coverage backfill           | `npx vitest run --coverage` already configured.                                                                                                                                                                                                                                  |
| @redocly/cli `^2.31.5` + markdown-link-check `^3.14.2` | Docs/OpenAPI lint for the docs pass | `npm run openapi:lint` + `npm run docs:lint` already wired.                                                                                                                                                                                                                      |

## Feature-by-Feature Stack Verdict

### Feature 1 — Water filter fix (DEBUG, no dep)

The drop is inside the **compound admission gate**: `admit = hasName(tags) AND (isNotable || isPriorityCountry || hasCapacityData)`, with the Latin-label sub-gate (`hasLatinLabel` → `isRealLatin` → `GENERIC_OSM_NAME_RE`), the **desalination D-03 bypass**, and the **WATER-LATIN-03 romanize-before-gate** step. Intermittent drops are almost certainly a _logic interaction_ between these branches (e.g. a romanized name collapsing to a generic English word, or a desalination synthesis path that skips romanization). This is a `vitest` + `scripts/audit-water-names.ts` debugging task. `transliteration@2.6.1` stays; no new dep. **Do NOT** reach for a heavier NLP/transliteration library — the existing one is the byte-identity-gated source of truth and swapping it would re-open that gate.

### Feature 2 — Event ghost links + events subtab (DEBUG + UI, no dep)

Dead links slipping past prune is a tuning/logic question in `server/lib/urlLiveness.ts` — the probe strategy is already polite-citizen grade (`createLimit(8)`, per-host 1 req/s throttle, ±200ms jitter, 10s timeout, 3-hop redirect cap, **HEAD-then-GET-on-405**, identifying User-Agent). Improvements live in the _classification_ (e.g. treating `403`/soft-404 bodies, widening the terminal-dead status set) and the **`attemptCount >= 3` prune gate**, not in a new HTTP client. Node's built-in `fetch` (Node 22.x engine) already powers the probe; no `undici`/`got`/`axios` needed. The events-subtab gap is React/Tailwind work in `DevApiStatus.tsx`.

### Feature 3 — Dashboard subtab cleanup (UI redesign, no dep)

**Bias-toward-no-deps holds firmly.** The off-the-grid military aesthetic is already encoded as CSS custom properties in the Tailwind v4 `@theme` block (24 entity color vars + z-index scale). Readability fixes — denser-to-airier layout, contrast, typography, replacing raw data dumps with summarized blocks — are pure utility-class + component-composition work. The project already hand-rolls its viz primitive (`src/components/markets/Sparkline.tsx`), so even inline charts need no library. **Explicitly reject** recharts / visx / d3 / a component kit (shadcn, Radix, MUI): they would import a foreign design language into a bespoke military theme, balloon the client bundle, and duplicate primitives that already exist.

### Feature 4 — ~100-user load test (RE-RUN, no dep)

k6 `v1.7.0` is installed and current; the v1.0 (May 2025) maturity release made the `k6/http` + scenarios + `ramping-vus` API a stable, semver-supported surface — nothing the existing script uses is deprecated. The 2026 best-practice pattern for serverless/Fluid-Compute backends is exactly what this project already does: **k6 OSS run locally (or from CI) for backend RPS/latency + cold-start measurement, paired with Playwright for browser-side functional + Core Web Vitals validation.** Grafana Cloud k6 is only worth it for geo-distributed or very-high-VU (>1k) tests — a 1–300 VU sweep runs fine from one local/CI machine, so **stay on k6 OSS.** The k6 **browser module (`k6/browser`) is GA**, but adopting it would _replace_ the working Playwright spec for no benefit — keep the existing split. Edit `RAMP_STAGES` in `scripts/load-test.js` to express the 1→300 sweep; capture cold-start via the existing `cold_start_duration` Trend metric (Fluid Compute cold starts are the metric of interest).

### Feature 5 — General hardening (CODE, no dep)

Rate-limiter public-global operator block → `server/middleware/rateLimiter.ts` (`express-rate-limit` + Bearer `timingSafeEqual`, already present). Cron first-tick verification + 7-day stability watch → existing `cron:lastTick:*` Redis keys + `scripts/snapshot-cron-watch.ts` (`npm run watch:snapshot`). Nyquist coverage backfill → `vitest`. All in-house.

### Feature 6 — Docs cleanup (DOCS, no dep)

`markdown-link-check` + `@redocly/cli` already power `npm run docs:lint` / `npm run openapi:lint`.

## Alternatives Considered

| Recommended (keep)                        | Alternative                        | When the alternative would win (NOT now)                                                                                                                         |
| ----------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| k6 OSS local/CI                           | Grafana Cloud k6                   | Only if you need geo-distributed VUs or >1k concurrent — overkill for a 1–300 sweep; adds account + cost.                                                        |
| k6 + Playwright split                     | k6 `k6/browser` module (GA)        | If you wanted a single binary for combined API+browser and were willing to rewrite the working Playwright spec — no payoff here.                                 |
| Node built-in `fetch` for URL probes      | undici / got / axios               | Only if you needed advanced retry/agent pooling beyond the current polite-citizen limiter — current logic already covers redirects, timeouts, HEAD/GET fallback. |
| Hand-rolled `Sparkline.tsx` + Tailwind    | recharts / visx / d3               | Only for genuinely complex interactive charts — dashboard cleanup needs none.                                                                                    |
| `transliteration@2.6.1`                   | ICU / a different romanizer        | Never mid-milestone — it's the byte-identity-gated source of truth for `nameLatin`.                                                                              |
| Tailwind v4 `@theme` + bespoke components | shadcn/ui, Radix, MUI, Headless UI | Only on a from-scratch design system — would fight the existing military aesthetic and bloat the bundle.                                                         |

## What NOT to Use

| Avoid                                             | Why                                                                                                             | Use Instead                                                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Any new chart library (recharts/visx/d3/chart.js) | Duplicates existing `Sparkline.tsx`; imports foreign visual language into the military theme; bundle bloat      | Existing `Sparkline.tsx` + Tailwind utilities                                   |
| Any component kit (shadcn/Radix/MUI/Headless UI)  | Conflicts with the bespoke off-the-grid aesthetic; large dep tree; the dashboard is already hand-built          | Compose existing `*Block.tsx` components + Tailwind `@theme` tokens             |
| undici/got/axios for URL liveness                 | Node 22.x global `fetch` already drives the probe with full redirect/timeout/HEAD-GET handling                  | Built-in `fetch` + existing `createLimit`/throttle                              |
| Swapping `transliteration` for another romanizer  | Re-opens the water `nameLatin` byte-identity gate; the bug is logic, not the library                            | Debug `hasLatinLabel` / `GENERIC_OSM_NAME_RE` / desalination-bypass interaction |
| Grafana Cloud k6 / Artillery / Locust / JMeter    | k6 OSS already installed, scripted, and validated (501 VUs in v1.2); switching tools discards a working harness | Existing `scripts/load-test.js` (edit `RAMP_STAGES`)                            |
| k6 `k6/browser` module                            | GA but would replace the working Playwright spec for no benefit                                                 | Keep `scripts/load-test.spec.ts` running alongside k6                           |
| Migrating `vercel.ts` → Build Output API now      | Explicitly deferred-with-rationale at v1.6 D-09 (risky); out of v2.0 scope                                      | Leave `api/vercel-entry.js` tsup bundle as-is                                   |

## Version Compatibility

| Package          | Version                                 | Compatibility note                                                                                                       |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| k6               | `v1.7.0`                                | `k6/http` + `ramping-vus` stable since k6 v1.0 (May 2025); semver two-year support; no API churn affects `load-test.js`. |
| @playwright/test | `^1.58.2`                               | Runs standalone against prod URL; no coupling to k6 version.                                                             |
| Node engine      | `22.x` (pinned in `package.json`)       | Global `fetch` GA — URL-liveness probe needs no HTTP-client dep.                                                         |
| TypeScript       | `~5.9.3` (pinned)                       | Held below TS 6.0 deliberately; no v2.0 tooling forces an upgrade.                                                       |
| transliteration  | `2.6.1` (exact pin)                     | Keep exact-pinned to preserve `nameLatin` byte-identity gate.                                                            |
| Tailwind CSS     | `^4.2.1` + `@tailwindcss/vite` `^4.2.1` | CSS-first `@theme`; redesign uses utilities only — no config-file reintroduction.                                        |

## Integration Considerations

- **Load test (feature 4):** Run k6 against the _production_ Vercel Pro alias (Fluid Compute cold starts only reproduce on the real platform, not `vite dev`). The existing `rate_limited` Counter + `cold_start_duration` Trend are the metrics to watch; expect the public 60-req/min global limiter to throttle synthetic VUs unless the test sends a valid `DASHBOARD_PASSWORD` Bearer (feature 5's operator-block work interacts here — coordinate the rate-limiter change with the load-test VU profile so the test measures real capacity, not the limiter).
- **Dashboard redesign (feature 3):** All color/spacing changes flow through `src/styles/app.css` `@theme` and `src/lib/colorBridge.ts`; the byte-identity sentinel test (`src/__tests__/lib/colorBridge.test.ts`) will fail on any drift — treat that as the guardrail, not a blocker.
- **Water + URL-liveness debugging (features 1–2):** Both have Redis-key schema tests (`waterFilterStats.test.ts`, `urlLiveness.schema.test.ts`) pinning their shapes — changes that touch persisted JSON must update the pinned schemas in lockstep.

## Sources

- Local toolchain probe — `k6 v1.7.0` confirmed installed (`/opt/homebrew/bin/k6`); `package.json` deps/devDeps inspected directly (HIGH).
- [Grafana k6 GitHub releases](https://github.com/grafana/k6/releases) — `k6/http` + `ramping-vus` not deprecated; `k6/browser` GA (HIGH; minor version-string noise in the fetched page reconciled against the installed v1.7.0 ground truth).
- [k6.io](https://k6.io/) / [k6 OSS](https://k6.io/open-source/) — k6 v1.0 maturity release (May 2025): first-class TS, semver, two-year support (HIGH).
- [Best Load Testing Tools 2026 — k6 vs Locust vs JMeter vs Artillery](https://thesoftwarescout.com/best-load-testing-tools-2026-k6-vs-locust-vs-jmeter-vs-artillery-compared/) — 2026 best-practice: k6 OSS for daily/CI checks, Cloud only for distributed/high-VU (MEDIUM).
- [Grafana Cloud k6](https://grafana.com/products/cloud/performance-load-testing-k6/) — cloud is for geo-distributed/large-scale; confirms OSS suffices for a 1–300 VU local sweep (MEDIUM).
- Repo inspection — `scripts/load-test.js`, `scripts/load-test.spec.ts`, `server/adapters/overpass-water.ts`, `server/lib/urlLiveness.ts`, `src/components/markets/Sparkline.tsx` read directly to confirm existing capabilities (HIGH).

---

_Stack research for: v2.0 Final Hardening of otg-iran-monitor_
_Researched: 2026-06-09_
