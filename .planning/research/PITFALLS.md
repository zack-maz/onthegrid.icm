# Pitfalls Research

**Domain:** Hardening / fix / redesign / load-test pass on a live production conflict-monitoring dashboard (Vercel Pro + Fluid Compute + Upstash Redis, multi-stage data pipelines with drift-gate test suites)
**Researched:** 2026-06-09
**Confidence:** HIGH (grounded in the actual `overpass-water.ts`, `urlLiveness.ts`, `routes/water.ts`, `load-test.js`, `redis-registry.test.ts`, and `DevApiStatus.tsx` source — not generic advice)

> Scope note: these are pitfalls of **adding** the six v2.0 Final Hardening features to an already-shipped system, with emphasis on integration with the live 24h/7d-TTL Redis caches and the mechanical drift-gate test suites. Generic web pitfalls are omitted in favor of project-specific failure modes.

## Critical Pitfalls

### Pitfall 1: "Fixing" the wrong stage of the water admission pipeline

**What goes wrong:**
The water-filter bug ("sometimes isn't grabbing all values") is debugged at the visible symptom (facilities missing from the map) and a fix is applied at the rendering/store layer or the `hasLatinLabel` gate, when the actual drop happened upstream at Overpass fetch, `classifyWaterType`, the `applyRomanizedName` romanization step, the 2-of-3 compound gate, the `excluded_turkey` / `isExcludedLocation` geographic carve-out, the `no_city` reservoir rule, or the 50m spatial dedup. The fix then either does nothing (wrong stage) or over-admits noise (loosening the wrong gate). Worse: a "fix" that loosens `hasLatinLabel`/`hasName` re-introduces the exact "Dam near X" generic-label regression that Phase 27.3.1 G1 was built to kill.

**Why it happens:**
The drop is intermittent and the pipeline is 8+ stages deep (`fetchFacilityType` → `normalizeWaterElement` → `applyRomanizedName` → `computeAdmissionDecision` (6 ordered reject branches, first-match-wins) → score floor → dedup). Each stage already has years of phase-specific rationale baked in as reject buckets. The instinct is to add facilities back, not to find which bucket ate them. There is already a full per-type rejection telemetry surface (`stats.byTypeRejections`, `byCountry`, `overpass[]`) that nobody reads first.

**How to avoid:**
Diagnose with the EXISTING telemetry before touching code. `fetchWaterFacilities()` already tallies `rawCounts` vs `filteredCounts` per type plus per-bucket rejection counts (`excluded_location`, `excluded_turkey`, `not_notable`, `no_name`, `no_resolved_name`, `duplicate`, `low_score`, `no_city`). Run `npm run refresh:water` (or `scripts/audit-water-names.ts`) and read which bucket the missing facilities land in — the bucket _names_ the stage. Only then patch that one branch in `computeAdmissionDecision`. Add a regression fixture (the specific OSM element that was wrongly dropped) to the water tests so the fix is pinned. NEVER loosen `hasName`/`hasLatinLabel` without re-running the generic-label grep acceptance on `src/data/water-facilities.json`.

**Warning signs:**
A proposed fix that doesn't cite a specific rejection bucket; a diff that touches the store/layer instead of the adapter; `filteredCounts` rising but `no_resolved_name`/`not_notable` not falling correspondingly; "Dam"/"Reservoir" generic labels reappearing in the snapshot.

**Phase to address:** Water filter fix phase (feature 1) — make telemetry-driven diagnosis a required gate before any code change.

---

### Pitfall 2: Invalidating the self-healing water cache contract while fixing it

**What goes wrong:**
The water fix changes the `WaterFacility` shape (e.g. adds a field) or the `WaterFilterStats` shape but does NOT bump `FACILITIES_KEY` (`water:facilities:v3`). Live Redis still holds 24h-TTL `v3` payloads in the OLD shape. Either (a) the `.strict()` `waterResponseSchema` Zod parse throws on the stale envelope and the route silently falls through to the snapshot tier (data looks fine but the fix isn't actually live until the cache expires up to 24h later), or (b) the regenerated `src/data/water-facilities.json` snapshot is committed in the new shape while a stale Redis `v3` in the old shape keeps being served, so the fix "works locally, not in prod." The 4-tier fallback (Redis → devFileCache → snapshot → Overpass) makes the symptom invisible.

**Why it happens:**
The cache key bump is a manual discipline, not enforced by a test. The route's degrade-open design (serve snapshot on any cache miss/parse failure) is specifically engineered to hide upstream problems — which also hides "my fix didn't take." The precip path ALSO writes `FACILITIES_KEY` (`/api/water/precip` warms the envelope), so a fix can be defeated by the precip endpoint re-warming Redis with stale-shaped stats.

**How to avoid:**
ANY change to `WaterFacility` or `WaterFilterStats` shape MUST bump `FACILITIES_KEY` (v3→v4) — this is the documented Plan 11 G3 / D-11 pattern (the existing bumps v1→v2→v3 each cite a shape change). Regenerate AND commit the snapshot in the same PR. After deploy, verify the fix is live via the `source` provenance field in `/api/water` (should be `overpass`/`snapshot` on first hit, not `redis` serving a stale shape) AND a post-deploy `generatedAt`. Remember BOTH `/api/water` and `/api/water/precip` write `FACILITIES_KEY` — audit both writers.

**Warning signs:**
Shape change with no key bump in the diff; `.strict()` Zod parse failures in logs after deploy; fix works against a fresh local Redis but not prod for up to 24h; `source: 'redis'` with a pre-deploy `generatedAt`.

**Phase to address:** Water filter fix phase (feature 1) — add "key bump + snapshot regen + post-deploy provenance check" to phase success criteria.

---

### Pitfall 3: False-positive ghost-link pruning that deletes live events

**What goes wrong:**
Tightening the URL-liveness prune to catch more ghost links instead deletes events whose URLs are actually live. The classic cause: a bot-blocking `403` (Cloudflare/CDN refusing the `IranMonitor-LinkCheck` User-Agent) is currently classified as terminal-dead and is prune-eligible — but the article is fine in a browser. Loosening the cron `attemptCount >= 3` gate, or promoting `unknown`/`5xx`/`429` into the terminal-dead set, or removing the HEAD→GET-on-405 fallback, causes the daily cron to silently splice live events out of `events:llm:v3`. Because the cron prune writer (`bearerFingerprint: 'cron:refresh-events'`) BYPASSES the prune quota, a bad rule can mass-delete in one unattended run.

**Why it happens:**
"More ghost links are slipping through" reads as "the prune is too lax," so the instinct is to widen the terminal-dead taxonomy or drop the 3-consecutive-tick gate. But `403` already counts as terminal-dead in the current taxonomy (`isTerminalDead`), and many legitimate publishers 403 a HEAD from an unknown UA. The dead-event count sidecar and the `attemptCount` monotonic-with-reset semantics were specifically designed so a dead→live→dead flap does NOT reach `attemptCount >= 3` — loosening that re-opens the flap-deletes-live-event hole.

**How to avoid:**
Treat the bug as a probe-precision problem, not a prune-aggressiveness problem. Before changing the prune gate, sample WHY links are slipping: are they truly 404 (genuine ghosts the probe missed) or are they `unknown`/never-probed because the sweep ran out of budget (`skippedBudget`) under the 800s deadline? If links slip because the sweep didn't finish, the fix is sweep coverage/ordering (Tier-A never-probed priority), not a looser prune. KEEP `403` distinct from `404`; consider demoting `403` out of the cron auto-prune set (manual-only) since `403` is the highest false-positive risk. NEVER let the cron path prune on `unknown`. Preserve the `attemptCount >= 3` cron gate. Review a `prunedIds` sample (dry-run) before widening any rule.

**Warning signs:**
A diff that adds `unknown`/`410`/`429` to `isTerminalDead`; lowering the `attemptCount >= 3` cron gate; `403` promoted to cron-prune-eligible; prune counts spiking after a probe-UA or redirect-cap change; operators reporting "an event I was watching disappeared."

**Phase to address:** Event ghost links + events subtab phase (feature 2) — require a `prunedIds` sample audit and a 403-false-positive analysis before any prune-rule change.

---

### Pitfall 4: Redesigning the dashboard monolith and breaking the ARIA tablist + snapshot/merge tests

**What goes wrong:**
`DevApiStatus.tsx` is a 3,538-line monolith implementing a WAI-ARIA `role="tablist"` with manual-activation roving-tabindex keyboard navigation (Arrow/Home/End over live `[role="tab"]` queries), `role="tabpanel"` + `aria-labelledby` links, and degrade-open rendering for every data block. It is pinned by `DevApiStatusConsolidatedLayout.snapshot.test.tsx`, `DevApiStatus.tabMerge.test.tsx`, `DevApiStatus.diagnosticBlocks.test.tsx`, and `DevApiStatus.operatorActions.test.tsx`. A "readability redesign" that restructures DOM order, renames tab ids, or splits panels breaks the snapshot test (noisy but harmless) AND can silently break the roving-tabindex (which queries the DOM live) and the `aria-labelledby` id wiring (an accessibility regression no snapshot catches if ids merely drift). Scope-creep turns "make it readable" into a full rewrite of a load-bearing operator surface.

**Why it happens:**
The component is huge and dense, so "redesign for readability" feels like license to refactor freely. The ARIA contract is behavioral (keyboard nav, focus management) and only partially captured by tests — the snapshot pins the rendered tree, but roving-tabindex correctness depends on `tab-{id}`/`aria-labelledby` pairs staying consistent. Degrade-open blocks (every panel must render with null/missing data) are easy to break when reflowing layout.

**How to avoid:**
Scope-lock the redesign to styling/typography/contrast within the existing off-the-grid aesthetic — NOT DOM restructure. Keep tab ids (`tab-api-health`, `tab-water`, `tab-sites`, `tab-events`) and their `aria-labelledby` partners byte-stable. If panels must split, preserve the `[role="tab"]`/`[role="tabpanel"]` count and id wiring so the roving-tabindex query still works. Update the snapshot deliberately (`vitest -u`) and eyeball the diff — never blanket-accept. Keep every block degrade-open. Add an explicit keyboard-nav assertion (Arrow moves focus across rendered tabs) if one doesn't exist. Prefer extracting sub-panels into child components WITHOUT changing the public DOM contract.

**Warning signs:**
Snapshot diff touching `role`/`aria-*` attributes; tab ids renamed; panel count changed; keyboard nav no longer cycles tabs; a block throwing on null data instead of rendering a placeholder; the redesign PR diff exceeding the styling surface (touching data-fetch or state logic).

**Phase to address:** Dashboard subtab cleanup phase (feature 3) — write the scope-lock (styling-only, ARIA contract frozen) into phase requirements; treat snapshot churn as a review gate, not an auto-accept.

---

### Pitfall 5: Load-testing the wrong target — triggering prod LLM cron, blowing Active CPU / Upstash budget, or fighting the rate limiter

**What goes wrong:**
The k6 sweep (1→300 VU per the carry-forward) is pointed at production `otg-iran-monitor.vercel.app` and (a) accidentally hits a force-trigger/cron path that wakes the daily LLM extraction (expensive NIM tokens + 800s function), (b) drives Vercel Pro **Active CPU billing** and Upstash **per-command budget** up via real fan-out (every `/api/flights` miss = Redis ops), and/or (c) gets throttled by the very rate limiters under test — `rateLimiters.public` 60/min global, plus per-endpoint tiers (flights 120/min, events 20/min). The test then measures the rate limiter, not capacity, and the run is interpreted as "the app can't handle 100 users" when it's actually 429s by design. The existing `load-test.js` already counts 429s as expected (not failures) — but an operator reading raw p95 without that lens draws the wrong conclusion.

**Why it happens:**
"100 concurrent users" implies hitting prod for realism, but prod is the live portfolio surface with paid LLM and metered Redis/CPU. `/api/events` is cache-only (safe), BUT any `?force=true` or cron-path call is a token-spend landmine. Vercel Pro's Active CPU and Upstash's command quota are billed by usage; a 300-VU sweep for several minutes is a real bill. The rate limiter's Bearer-bypass means an UNauthenticated test sees the strict public tier and 429s early.

**How to avoid:**
Decide target explicitly: test a **preview deployment** or a dedicated load-test alias backed by a SEPARATE Upstash database, NOT prod — so command budget and a poisoned cache can't hit the live surface. NEVER include `?force=true`, `/api/cron/*`, `/llm-replay`, or `/llm-history` in the VU mix (the existing script restricts to read endpoints — keep it that way). If you MUST test prod, run a valid `DASHBOARD_PASSWORD` Bearer to bypass the public limiter for the capacity measurement, and run a SECOND pass without it to characterize the limiter — report them separately. Pre/post-test, snapshot Upstash command count and Vercel Active-CPU/usage to bound the bill (the script already grabs `/health` `estimatedDailyCommands`). Treat 429s as a separate metric (the script's `rate_limited` counter), not as `http_req_failed`. Hit ~100 VU steady (the stated goal) before pushing to 300 — 300 mostly measures the limiter.

**Warning signs:**
k6 `BASE_URL` pointed at the prod alias; cron/force/operator endpoints in the VU scenarios; a spiking Upstash command graph or Vercel Active-CPU bill during the run; high `http_req_failed` that is actually 429s; a "fail" verdict driven by rate-limited traffic; NIM token spend or a fresh `events:llm:v3` write timestamp during the test window.

**Phase to address:** ~100 concurrent-user load test phase (feature 4) — pin target (preview + separate Upstash), endpoint allowlist (no cron/force/operator), Bearer strategy, and cost-snapshot guardrails into phase setup.

---

### Pitfall 6: A long-running cron/observation watch stalling the milestone (the v1.5 Phase 31 repeat)

**What goes wrong:**
The CRON-WATCH-01 7-day cron-stability watch (and any "observe in prod" hardening step) becomes a wall-clock blocker: the milestone can't audit-complete until 7 consecutive green days accrue, so it either drags for a week or gets early-closed AGAIN — which is exactly what happened in v1.5 Phase 31 (Day-1 PASS captured, Days 2–7 abandoned, and a slow-burn regression then surfaced during Phase 37). Early-closing the watch a second time defeats its entire purpose: the failure mode it exists to catch is precisely a slow-burn one that a single day's PASS cannot see.

**Why it happens:**
A 7-day watch is structurally incompatible with "finish the milestone this session" pressure. The previous early-close set a precedent. The watch produces no code artifact, so it feels like dead time. There's a temptation to bundle it into the milestone's critical path rather than run it as a detached, non-blocking observation.

**How to avoid:**
Structure the 7-day watch as an ASYNCHRONOUS, non-blocking phase that runs in parallel with docs/other work and does NOT gate milestone close — capture an explicit decision: either (a) the milestone ships with the watch flagged "in-progress, auto-reported via `cron:lastTick:*` + `/api/cron/health`," or (b) the milestone is intentionally held open 7 days. Make the watch self-reporting from data that already exists (`cron:lastTick:{health,warm,refresh-events}` freshness, eval-drift baseline, breaker trips) so it requires zero babysitting — a daily automated check, not a manual vigil. Define the PASS bar up front (7 consecutive `/api/cron/health` greens, eval ≥ baseline, 0 breaker trips) and the early-close criteria explicitly, so a second early-close is a logged decision with a rationale, not a silent repeat. If early-closing is genuinely necessary, schedule a follow-up automated check rather than declaring victory on Day 1.

**Warning signs:**
The watch is on the milestone's critical path; "we'll just capture Day 1 again"; no automated daily reporter wired; the PASS bar undefined; the same `cerebras-groq-deferred`-style "captured single day, deferred the rest" language reappearing.

**Phase to address:** General hardening phase (feature 5) — make CRON-WATCH-01 explicitly non-blocking + auto-reported; record the early-close criteria as a decision, citing the Phase 31 precedent.

---

### Pitfall 7: Docs changes desynced from code tripping the mechanical drift gates

**What goes wrong:**
The fix/redesign phases change Redis keys, endpoints, env vars, or schemas, and the docs-cleanup pass lands SEPARATELY — so for the interval between them, the mechanical drift gates fail the build. Specifically: the **Redis-key registry gate** (`redis-registry.test.ts`) asserts three-surface parity — every code-referenced key must be documented in BOTH `CLAUDE.md §Serverless Cache` AND `docs/architecture/redis-keys.md`, and vice versa (39 assertions × 4 sub-suites). A new key (or a bumped `water:facilities:v4`) referenced in code but not in both markdown surfaces fails `vitest run`. Similarly the **OpenAPI Redocly lint** fails if an endpoint shape drifts from the 19-endpoint spec, and **`check:env`** (`scripts/check-env-example.ts`) fails if an env var is added without updating `.env.example`. A naive ordering ("ship code now, fix docs in the cleanup phase") guarantees a red CI window and can block the very deploys the fixes need.

**Why it happens:**
The repo treats docs as a final-phase cleanup ("docs cleanup pass after the above lands"), but several docs surfaces are NOT docs — they are mechanically enforced contracts. The registry gate specifically requires parity across two markdown files; updating only `CLAUDE.md` (the habitual file) still fails because `redis-keys.md` is also asserted. Bumping a cache key for a water/ghost-link fix is the most likely trigger and the easiest to forget.

**How to avoid:**
Treat the drift-gated surfaces as part of the CODE change, not the docs phase. Any PR that adds/bumps a Redis key updates BOTH `CLAUDE.md §Serverless Cache` AND `docs/architecture/redis-keys.md` in the SAME PR (or adds a cited `EXEMPT_KEYS` entry with a `file:line` reason). Any endpoint change updates the OpenAPI spec in the same PR (Redocly lint is in CI). Any env var change updates `.env.example` in the same PR (`check:env`). Run the gates locally before pushing: `npx vitest run src/__tests__/lib/redis-registry.test.ts`, the OpenAPI lint test, and `npm run check:env`. Reserve the final docs-cleanup phase for PROSE (README/runbook/ADR narrative), not contract surfaces.

**Warning signs:**
A cache-key bump or new key with no `redis-keys.md` edit in the diff; `redis-registry.test.ts` failing with "documented in CLAUDE.md but not redis-keys.md" (or vice versa); Redocly lint red after an endpoint tweak; `check:env` red after an env addition; a plan that defers ALL doc edits to the last phase.

**Phase to address:** Every code phase (1–5) keeps its own contract surfaces green; docs-cleanup phase (feature 6) handles prose only. Add "drift gates green" to each phase's success criteria.

---

### Pitfall 8: Cache writebacks silently re-TTLing the enriched cache down

**What goes wrong:**
A water or ghost-link fix writes back to a 24h/48h-TTL cache (`water:facilities:v3`, `events:llm:v3`) using the WRONG TTL — e.g. a prune splice that re-writes `events:llm:v3` with the short cooldown sentinel TTL instead of the 48h `LLM_TERMINAL_TTL_SEC`, silently shrinking the enriched cache's lifetime so it expires before the next daily cron re-fills it, leaving the map on the raw-GDELT Pitfall-1 fallback. The existing `pruneDeadUrlEvents` deliberately uses `LLM_TERMINAL_TTL_SEC` for exactly this reason; a new writer added during the ghost-link work can easily hand-roll a shorter TTL and reintroduce the bug.

**Why it happens:**
TTL is a per-`cacheSetSafe`-call argument, not a property of the key, so any new writer must remember the right one. The 48h terminal TTL vs the 15-min cooldown sentinel are both "events" TTLs and easy to confuse. The symptom (map falls back to raw GDELT a day later) is delayed and decoupled from the writing code.

**How to avoid:**
Any new writer to `events:llm:v3` MUST import and use `LLM_TERMINAL_TTL_SEC` (the `urlLiveness.ts` import-from-`llmExtractionPipeline.js` pattern exists precisely to avoid hand-rolling). Any writer to `water:facilities:v3` MUST use `WATER_REDIS_TTL_SEC`. Never pass a literal TTL number at a `cacheSetSafe` call site for these keys. After a prune or fix deploy, verify the v3 cache TTL in Redis is still ~48h, not minutes.

**Warning signs:**
A literal TTL number passed to `cacheSetSafe` for `events:llm:v3`/`water:facilities:v3`; the map flipping to raw-GDELT fallback ~a day after a ghost-link change; v3 key TTL reading in minutes instead of hours.

**Phase to address:** Event ghost links phase (feature 2) and water filter phase (feature 1) — code-review gate on every cache writeback's TTL argument.

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut                                                  | Immediate Benefit                  | Long-term Cost                                                                                          | When Acceptable                                                 |
| --------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Loosen `hasName`/`hasLatinLabel` to "fix" water drops     | More facilities appear immediately | Re-opens the G1 "Dam near X" generic-label regression; admits non-Latin noise                           | Never — fix the diagnosed bucket instead                        |
| Skip the `FACILITIES_KEY` bump on a shape change          | One less line                      | Stale 24h Redis serves old shape / `.strict()` parse fails silently; fix not live in prod for up to 24h | Never                                                           |
| Add `unknown`/`410`/`429` to terminal-dead taxonomy       | Catches more "dead" links          | Prunes live (bot-blocked / transient) events; flap-deletes watched events                               | Never for the cron path; manual-only at most                    |
| Point k6 at prod for "realism"                            | True edge latency                  | Active-CPU + Upstash bill; risk of waking LLM cron; poisoned live cache                                 | Only with Bearer + cost snapshot + read-only endpoint allowlist |
| Defer ALL doc edits to the final cleanup phase            | Faster code phases                 | Red CI window on drift gates; blocked deploys; registry parity failures                                 | Only for prose docs (README/runbook/ADR narrative)              |
| Early-close the 7-day cron watch on Day 1                 | Milestone closes now               | Slow-burn regression surfaces later (proven in v1.5 Phase 37)                                           | Only as a logged decision with a scheduled follow-up check      |
| Refactor `DevApiStatus` DOM during "readability" redesign | Cleaner structure                  | Breaks roving-tabindex / `aria-labelledby` wiring + snapshot/merge tests                                | Only with frozen tab-id contract + deliberate snapshot update   |
| Hand-roll a TTL literal at a new v3 cache writeback       | Quick write                        | Silently re-TTLs enriched cache down; map falls to raw-GDELT a day later                                | Never — import `LLM_TERMINAL_TTL_SEC`/`WATER_REDIS_TTL_SEC`     |

## Integration Gotchas

Common mistakes when connecting to external services / existing subsystems.

| Integration                           | Common Mistake                                                                   | Correct Approach                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Upstash Redis (live caches)           | Changing payload shape without bumping the key; hand-rolling TTL                 | Bump key (vN→vN+1) on shape change; import the canonical TTL constant                                       |
| Overpass API (water refresh)          | Re-running Overpass on the user request path while debugging                     | Overpass is OFF the request path (R-07); debug via `npm run refresh:water` / snapshot regen only            |
| Vercel Pro Fluid Compute              | Assuming module-singleton state (`hostNext`, `callHistory`) survives cold starts | It doesn't — rely on Redis write-through (`llm:lastProgress`, `cron:lastTick:*`) for cross-cold-start state |
| Vercel Pro Active CPU billing         | Load-testing prod and being surprised by the bill                                | Test preview/separate DB; snapshot usage pre/post; bound VU×duration                                        |
| Rate limiter (`express-rate-limit`)   | Reading 429s as failures in the load test                                        | Count 429s separately (`rate_limited`); use Bearer to bypass for capacity runs                              |
| URL-liveness probe (publishers)       | Treating bot-blocking `403` as a genuine dead link                               | Keep `403` distinct from `404`; demote `403` out of cron auto-prune (manual-only)                           |
| LLM cron (`/api/cron/refresh-events`) | Accidentally including force-trigger/cron paths in test or fix flows             | Allowlist read-only endpoints; never `?force=true` in tests                                                 |
| Redis-key registry gate               | Updating only `CLAUDE.md` when adding a key                                      | Update CLAUDE.md AND `docs/architecture/redis-keys.md` (three-surface parity)                               |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap                                                         | Symptoms                                                                    | Prevention                                                                                  | When It Breaks                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `/api/operator-status` doing N Redis GETs per dashboard poll | Slow dashboard; Upstash command spikes                                      | Use the O(1) `events:url-liveness-count` sidecar (already built) — don't add per-event GETs | Many dead events × frequent polls           |
| Probe sweep doesn't finish under 800s deadline               | `skippedBudget` high; never-probed events stay unflagged → "links slipping" | Tier-A never-probed priority + deadline guard (already built); don't add per-task overhead  | Large `events:llm:v3` corpus                |
| k6 at 300 VU mostly hitting the rate limiter                 | High 429 rate; p95 reflects limiter not capacity                            | Test ~100 VU steady (the goal); separate 429 metric                                         | Above the per-endpoint/public tier ceilings |
| `hostNext` throttle Map growing across warm instances        | Memory creep on long-lived Fluid Compute instance                           | `pruneStaleHostSlots()` end-of-sweep (already built) — keep it                              | Long warm-instance lifetime                 |
| Load test fanning out real cache misses                      | Upstash command budget burn; cold-start cost                                | Pre-warm caches; expect cache HITs to dominate; snapshot command count                      | Cold cache + high VU                        |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake                                                                             | Risk                                                                                    | Prevention                                                                                 |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Dropping the SSRF guard in the URL probe during ghost-link work                     | A stored event URL pointing at cloud-metadata / RFC1918 gets fetched from Vercel egress | Keep `isPrivateHost` check before every fetch AND on every redirect hop (already built)    |
| Removing the redirect-hop cap (`MAX_REDIRECTS=3`) to "follow more links"            | Redirect-loop DoS / SSRF via hostile redirect chain                                     | Keep the 3-hop manual cap + per-hop SSRF re-check                                          |
| Exposing operator endpoints (`/llm-history`, `/llm-replay`, prune) in the load test | Unauthenticated operator-action surface hit at scale                                    | Allowlist read-only endpoints only; operator routes stay Bearer-gated                      |
| Leaking the probe/User-Agent or internal mirror hosts in dashboard telemetry        | Info disclosure                                                                         | `overpass[].mirror` is a label not a URL (already built) — preserve that                   |
| Bearer fingerprint confusion in audit log during prune changes                      | Misattributed operator actions                                                          | Cron prune uses the literal `'cron:refresh-events'` fingerprint (already built) — preserve |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall                                                           | User Impact                                          | Better Approach                                                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Redesign drops degrade-open placeholders                          | Blocks render empty/throw when a data source is down | Every block renders with null/missing data (preserve degrade-open)                                                          |
| "Readability" redesign breaks keyboard nav                        | Operator can no longer Arrow between tabs            | Preserve roving-tabindex; add a keyboard-nav test                                                                           |
| Raw data dumps replaced with summaries that hide the numbers      | "Numbers over narratives" core value eroded          | Keep concrete counts (rejection buckets, dead-URL count, eval scores) visible; improve typography, not data density blindly |
| Ghost-link prune with no operator visibility into what was pruned | Operator can't tell why an event vanished            | Surface `prunedIds` + count in `/operator-status` audit (already built)                                                     |
| Map flickers a dead event for one poll cycle post-prune           | Brief stale render                                   | Documented ≤15-min race window; acceptable — don't add a heavy lock unless telemetry shows overlap                          |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Water fix:** Often missing the `FACILITIES_KEY` bump + committed snapshot regen — verify `source`/`generatedAt` provenance is post-deploy in `/api/water`
- [ ] **Water fix:** Often missing a regression fixture — verify a test pins the specific OSM element that was wrongly dropped
- [ ] **Ghost-link prune:** Often missing the 403-false-positive analysis — verify bot-blocked-but-live articles aren't auto-pruned
- [ ] **Ghost-link prune:** Often missing the "prune problem vs sweep-coverage problem" diagnosis — verify `skippedBudget` is near zero
- [ ] **Dashboard redesign:** Often missing ARIA contract preservation — verify tab ids + `aria-labelledby` stable and keyboard nav works
- [ ] **Dashboard redesign:** Often missing degrade-open — verify every block renders with null data
- [ ] **Load test:** Often missing the target/cost decision — verify preview + separate Upstash, no cron/force/operator endpoints, pre/post usage snapshots
- [ ] **Load test:** Often missing 429-as-expected accounting — verify `rate_limited` is separate from `http_req_failed`
- [ ] **Cron watch:** Often missing non-blocking structure — verify it's auto-reported and doesn't gate milestone close
- [ ] **Docs:** Often missing three-surface Redis parity — verify new/bumped keys are in CLAUDE.md AND redis-keys.md (run `redis-registry.test.ts`)
- [ ] **Any cache writeback:** Often missing the correct TTL constant — verify `LLM_TERMINAL_TTL_SEC`/`WATER_REDIS_TTL_SEC` used, not a literal

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall                                       | Recovery Cost | Recovery Steps                                                                                                      |
| --------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| Stale-shaped water cache served (no key bump) | LOW           | Bump `FACILITIES_KEY`, redeploy; old key orphans and expires via hard TTL                                           |
| Live events mass-pruned by a bad cron rule    | MEDIUM        | Operator `/llm-replay` re-extract; revert the prune-rule change; restore `attemptCount >= 3` cron gate              |
| Dashboard redesign broke ARIA/snapshot tests  | LOW           | Revert DOM changes to styling-only; restore tab-id/`aria-labelledby` wiring; regen snapshot deliberately            |
| Load test woke LLM cron / burned budget       | MEDIUM        | Stop test; verify no `?force` path; check NIM token-budget + Upstash command graph; re-scope to preview + allowlist |
| 7-day watch stalled the milestone             | LOW           | Convert to async auto-reported phase; log an early-close decision with a scheduled follow-up                        |
| Drift gate red in CI after docs/code desync   | LOW           | Add the missing `redis-keys.md`/`.env.example`/OpenAPI edit in the same PR, or a cited `EXEMPT_KEYS` entry          |
| Enriched cache re-TTL'd down (wrong TTL)      | LOW-MEDIUM    | Fix the writer to use the canonical TTL constant; force a cron refill (`?force=true` with Bearer) to restore v3     |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall                                | Prevention Phase                            | Verification                                                                                |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1. Fixing wrong water stage            | Water filter fix (feature 1)                | Fix cites a specific rejection bucket; regression fixture added                             |
| 2. Invalidating water cache contract   | Water filter fix (feature 1)                | Key bumped + snapshot regen; post-deploy provenance check                                   |
| 3. False-positive ghost-link prune     | Ghost links + events subtab (feature 2)     | 403 kept distinct; `attemptCount >= 3` cron gate intact; `prunedIds` sample reviewed        |
| 4. Dashboard ARIA/snapshot breakage    | Dashboard subtab cleanup (feature 3)        | Tab ids stable; keyboard nav test passes; snapshot diff reviewed; degrade-open intact       |
| 5. Load test wrong target/cost/limiter | ~100-user load test (feature 4)             | Preview + separate Upstash; endpoint allowlist; 429 metric separate; usage snapshot bounded |
| 6. 7-day watch stalls milestone        | General hardening (feature 5)               | Watch is non-blocking + auto-reported; early-close criteria logged                          |
| 7. Docs/code drift-gate failures       | Every code phase + docs cleanup (feature 6) | Drift gates green per-PR; docs phase = prose only                                           |
| 8. Wrong TTL re-shrinks enriched cache | Ghost links (2) + Water fix (1)             | Canonical TTL constant used; v3 TTL verified ~48h post-deploy                               |

## Sources

- Project source code (HIGH confidence — direct read): `server/adapters/overpass-water.ts`, `src/lib/waterLabel.ts`, `server/routes/water.ts`, `server/lib/urlLiveness.ts`, `scripts/load-test.js`, `src/__tests__/lib/redis-registry.test.ts`, `src/components/ui/DevApiStatus.tsx` (+ `__tests__/`), `package.json`
- Project context (HIGH): `.planning/PROJECT.md`, `CLAUDE.md`, memory notes `project_next_hardening_milestone`, `project_v1_6_priorities`, v1.5 Phase 31 early-close + Phase 37 slow-burn-regression history (Key Decisions table)
- Project conventions (HIGH): degrade-open / Pitfall-1 cache-bridge / drift-gate / TTL-constant patterns documented in CLAUDE.md §Serverless Cache + ADR-0010

---

_Pitfalls research for: v2.0 Final Hardening on a live production conflict dashboard_
_Researched: 2026-06-09_
