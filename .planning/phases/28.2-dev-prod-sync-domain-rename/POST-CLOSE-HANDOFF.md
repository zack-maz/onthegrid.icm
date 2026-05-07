# Phase 28.2 — Post-Close Cleanup Handoff

**Created:** 2026-05-06
**Phase 28.2 status:** ✅ COMPLETE (closed at `bf85527`, 16/17 W6 audit GREEN)
**Cleanup status:** in flight — three hotfix commits landed on `main` after the close

This document is for the next session when you resume from a fresh context window. It explains the small cleanup wave that ran between Phase 28.2's close and Phase 28.3's start, reminds you what 28.3 is, and recommends sequencing.

---

## What was done since 28.2 close

Three small commits landed on `main` after the phase-close commit, each fixing a real bug that surfaced as the operator (you) started using the prod dashboard for the first time. None changes Phase 28.2's deliverables — they fix latent bugs that the audit + first prod usage exposed.

### `03e4676` fix(28.2): make AppShell dashboard gate reactive after auth

**Symptom:** entered `DASHBOARD_PASSWORD = hello` into the auth modal, modal accepted it and closed, but the dashboard never appeared. Hard-refresh required to see anything.

**Cause:** `AppShell` mounted `<DevApiStatus />` behind a plain `shouldRenderDashboard()` call that reads `localStorage`. `setDashboardKey()` writes `localStorage` synchronously but doesn't trigger a React re-render, and `AppShell` didn't subscribe to any Zustand slice that flips on auth — so the conditional was never re-evaluated.

**Fix:** added `useShouldRenderDashboard()` hook in `src/lib/dashboardAuth.ts` that subscribes to `uiStore.isDashboardAuthOpen` so the consumer re-renders whenever the auth modal opens/closes. `AppShell` now uses the hook instead of the bare predicate.

### `cc3b388` fix(28.2): remove Polling Stores section from API Health tab

**Symptom:** the merged API Health tab (Phase 28.2 W5) carried a legacy "Polling Stores" table beneath the per-endpoint health table. The table duplicated state in a less-readable shape and showed misleading ERROR/STUCK statuses for stores like Sites/Water that were actually healthy on the server side.

**Fix:** deleted the `<section>` (~95 lines) plus the `expandedPollingRow` prop pipeline, the dead `expandedRow` outer state, and the now-unused `avgResponseTime` / `successRate` / `formatCountdown` / `statusColor` / `statusLabel` helpers. Kept the `rows[]` array + `effectiveStatus` / `formatAge` because they still drive the Topbar `API !` red pill and the clipboard diagnostics dump. The W5 D-22 "nothing-lost" tabMerge Test 2 was deleted correspondingly.

### `d568bea` fix(28.2): attach dashboard Bearer to all client polling fetches

**Symptom:** Water visualization layer toggled on, rivers + legend rendered, **but no facility icons appeared.** Same root cause was probably also masking partial signal on flights/ships/etc. under heavy refresh.

**Cause:** 11 client polling hooks (`useFlightPolling`, `useShipPolling`, `useEventPolling`, `useNewsPolling`, `useMarketPolling`, `useWeatherPolling`, `useSiteFetch`, `useWaterFetch`, `useWaterPrecipPolling`, `useLLMStatusPolling`, `useHealthStatus`) all fetched without an `Authorization: Bearer` header. Phase 28.2 W6's commit `e33a16b` extended the Bearer-bypass to per-endpoint rate-limit tiers explicitly so authed operators wouldn't be throttled — but only when the Bearer is actually on the request. Anonymous fetches still hit the per-endpoint 10/min limiters and silently 429'd.

Concrete repro: `curl https://otg-iran-monitor.vercel.app/api/water` without Bearer returned 429; with Bearer returned 304 facilities.

**Fix:** each hook now imports `dashboardAuthHeaders()` from `src/lib/dashboardAuth` and passes `{ headers: dashboardAuthHeaders() }` to `fetch`. Helper returns `{}` when no key is in localStorage (anonymous users behave identically to before) and `{ Authorization: 'Bearer <key>' }` once the operator authenticates.

---

## What Phase 28.3 is for (reminder)

**Phase 28.3 — Performance Optimization + 1–300 VU Load Test** (umbrella child of Phase 28, sequence position 3 of 3). From `.planning/ROADMAP.md`:

**Goal:** validate production handles 1–300 concurrent users with measurable PASS/FAIL against a clean codebase.

**Two bundled concerns:**

1. **Performance optimization layer (D-19) — add `s-maxage` CDN headers to `/api/*`:**
   - flights 5s, ships 30s, markets 60s
   - events / news 900s (15 min)
   - sites / water 86400s (1 day)
   - Goal: Vercel CDN absorbs bulk reads at 300 VU; Redis only fires on cache miss + warm-up cron.
2. **k6 load sweep (D-15 / D-16 / D-20):**
   - GitHub Actions runner; results land as PR artifacts.
   - Six discrete tiers: 50 / 100 / 150 / 200 / 250 / 300 VU.
   - 60s ramp + 5min steady per tier (~45 min wall-time per sweep).
   - Per-VU traffic shape (D-20): t=0 fires sites/water/sources/markets/flights/ships/events/news, then polls flights@5s, ships@30s, markets@60s, events@15min, news@15min — ~0.27 req/s/VU → ~81 RPS at 300 VU.

**PASS/FAIL bar (D-17), measured at 300 VU steady-state:**

- p95 < 500ms hot endpoints
- p99 < 1500ms
- error rate < 1%
- no 5xx spikes
- **cache-hit > 90% (non-negotiable)**

**Beyond PASS/FAIL (D-18):** per-endpoint latency breakdown, 429 count (validates the Bearer-bypass), Vercel cold-start frequency (validates warm-up cron sufficiency), Upstash Redis cache hit ratio.

**Hobby cron cap = 3, load test does NOT consume a slot.**

---

## Recommendation: should the cleanup happen before or after 28.3?

**The three commits above are already on main and are the cleanup.** The question is really: do we add more polish before starting 28.3, or proceed?

**Recommendation: proceed to 28.3 next session, no further pre-28.3 cleanup.**

Reasons:

1. **The fixes already address what 28.3 cares about most.** The Bearer-on-all-fetches change has direct implications for the load test — k6's authenticated VU traffic will now correctly exercise the W6 Bearer-bypass path, and unauthenticated traffic will exercise the rate-limiter as designed. Without that fix, 28.3 would have been measuring a different (broken) baseline.

2. **28.3 itself is partly a cleanup phase.** The s-maxage CDN-header layer (D-19) addresses the deeper consequence of what we found here: anonymous users currently hit per-endpoint 429s on rapid polling because every request invokes the function. Once 28.3 lands the s-maxage headers, Vercel CDN will serve cached responses without invoking the function at all → no rate limiter hit → anonymous users get fast responses. The "polling stores" symptoms we just deleted from the dashboard would be far less common with proper CDN caching anyway.

3. **The PASS/FAIL bar will tell us if more cleanup is needed.** If 28.3's 300 VU sweep shows p95 > 500ms, error rate > 1%, or cache-hit < 90%, that's empirical data pointing at specific remediation work. Doing speculative cleanup before the load test risks fixing the wrong things.

4. **Context-window pragmatics.** This session has accumulated significant context (Phase 28.2 closeout + 5 hotfixes + 3 post-close hotfixes + dashboard UX debugging). 28.3 is large enough (k6 + CI workflow + CDN-header migration across all `/api/*` routes + analysis pipeline) that it deserves a fresh window with the goal-backward planner running clean.

**One small follow-up that's NOT 28.3-blocking but worth noting:** the `news` endpoint still returns 502 UPSTREAM_FAIL under GDELT-side 429 throttle on the GH-runner egress. Operator can retrigger `prod-connectivity-audit.yml` any time the throttle clears for a 17/17 record run. Not a code issue.

---

## How to start Phase 28.3 next session

1. New session, clean context window.
2. Verify state: `git log --oneline bf85527..HEAD` should show three post-close hotfix commits + this handoff doc.
3. `/gsd-discuss-phase 28.3` to gather context (or `/gsd-plan-phase 28.3` if you already know the structure).
4. Per `.planning/ROADMAP.md` line 318, the umbrella inputs are 28-CONTEXT.md D-01 / D-02 / D-15 / D-16 / D-17 / D-18 / D-19 / D-20 / D-21 — read those first.
5. Note Vercel project is now `onthegrid.icm` (not `irt-monitoring`); production URL is `otg-iran-monitor.vercel.app`. The k6 BASE_URL default at `scripts/load-test.js:18` already points at the right place.
6. GH Actions secrets `PROD_DASHBOARD_PASSWORD` / `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are already configured on the repo for the connectivity audit — k6 workflow likely needs the same set.

---

## Key absolute paths (for fresh-context lookup)

- `/Users/zackmaz/Desktop/my_world/.planning/STATE.md` — phase 28.2 marked complete, 10/20 phases, 86/88 plans
- `/Users/zackmaz/Desktop/my_world/.planning/ROADMAP.md` line 316 — Phase 28.3 entry
- `/Users/zackmaz/Desktop/my_world/.planning/phases/28.2-dev-prod-sync-domain-rename/28.2-VERIFICATION.md` — verifier verdict
- `/Users/zackmaz/Desktop/my_world/.planning/phases/28.2-dev-prod-sync-domain-rename/28.2-W6-AUDIT.md` — final audit log
- `/Users/zackmaz/Desktop/my_world/scripts/load-test.js` — k6 entry point (already pointed at `otg-iran-monitor.vercel.app`)
- `/Users/zackmaz/Desktop/my_world/scripts/load-test.spec.ts` — Playwright validation companion
- `/Users/zackmaz/Desktop/my_world/.github/workflows/prod-connectivity-audit.yml` — pattern to follow for the k6 workflow

---

_Phase: 28.2-dev-prod-sync-domain-rename · Status: closed + post-close cleanup landed_
_Next: Phase 28.3 — Performance Optimization + 1–300 VU Load Test_
