---
status: complete
phase: 41-public-reveal-polish
source: [41-VERIFICATION.md]
started: 2026-06-06T02:07:14Z
updated: 2026-06-09T19:16:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Intro overlay first-visit render + persistence

expected: Fresh profile / cleared `iran-monitor.intro-seen` → overlay appears; "Explore the map" dismisses and persists across reload; "Start the tour" dismisses + opens tour. Escape also dismisses (Priority 0 in the centralized key stack — must not fall through to reset-camera under the backdrop).
result: pass
evidence: |
Verified on live prod https://otg-iran-monitor.vercel.app (deploy 32017ef) via Playwright.

- Cleared key + reload → `[data-testid="intro-overlay"]` present, `intro-seen=null` on mount
  (NOT auto-set), focus on primary "Start the tour" button (WR-03). Screenshot
  phase41-check1-intro-overlay.png.
- "Explore the map" → overlay removed, `intro-seen="true"`; survives reload (overlay stays gone).
- "Start the tour" → overlay removed, `intro-seen="true"`, driver.js tour launched (step 1 "Live counts").
- Escape → overlay removed, `intro-seen="true"` (Priority-0 handler consumed the key).

### 2. Guided tour spotlight geometry (WR-01 fix)

expected: Triggering the tour (TourTrigger, data-testid="tour-trigger") steps through all 5 driver.js steps; each spotlight lands on the intended on-screen HUD node — step 2 opens the Sidebar Layers section before spotlighting it, step 4 opens the detail panel before spotlighting it (the WR-01 fix added `onHighlightStarted` panel-open hooks); no spotlight lands on an empty/off-viewport region. Panel state is restored when the tour ends.
result: pass
note: minor-cosmetic
evidence: |
Stepped through all 5 steps on live prod via Playwright; highlighted element's data-tour
attribute matched the step selector each time:

- Step 1 status (rect 16,14 top-left, in-viewport)
- Step 2 layers — WR-01 hook opened the sidebar; element rendered in-viewport (screenshot
  phase41-check2-tour-step2-layers.png)
- Step 3 map (full viewport 0,24,1280,672)
- Step 4 detail — WR-01 hook opened the detail panel (settled x=806,w=360 in-viewport);
  SVG spotlight cutout at x=706–1076 (right side, overlapping the panel), popover adjacent
  to its left (x=410–710)
- Step 5 api-health (cutout x=1060 exactly matched element rect, top-right)
  Tour end (Done): popover + overlay removed; sidebar restored to closed (x=-336), detail panel
  restored to closed (computed `translate-x-full` / translate:100%).
  MINOR COSMETIC OBSERVATION (non-blocking): step-4 spotlight cutout (x=706–1076) is offset ~100px
  left of the panel's settled position (x=806–1166) because driver.js measured the cutout during
  the 300ms slide-in CSS transition and did not re-measure after it completed. Still lands on the
  right-side panel region (not empty/off-viewport), so meets the stated criterion. Candidate polish
  item for the next hardening milestone (driver.refresh() after panel animation settles).

### 3. OG / Twitter social-share card preview (post-deploy)

expected: After deploying to production, the LinkedIn Post Inspector and Twitter/X Card Validator (and a direct paste preview) render the share card from `https://otg-iran-monitor.vercel.app/screenshots/og-card.png` at 1200×630 with the correct title/description. (Cannot be verified pre-deploy — crawlers fetch the live URL.)
result: pass
note: crawler-render-is-manual-paste-test
evidence: |
Verified on live prod (deploy 32017ef):

- /screenshots/og-card.png → HTTP 200, content-type image/png, 296042 bytes, decoded as a real
  1200×630 PNG (was a 715B text/html SPA-404 on the prior v1.5 prod).
- <meta property="og:image"> + <meta name="twitter:image"> both = absolute
  https://otg-iran-monitor.vercel.app/screenshots/og-card.png
- og:image:width=1200, og:image:height=630, og:type=website, og:url absolute,
  twitter:card=summary_large_image, og/twitter title "Iran Monitor — Real-time conflict
  intelligence dashboard".
  FLAGGED HUMAN PASTE-TEST (non-blocking, per criterion): external crawler render in LinkedIn Post
  Inspector / Twitter Card Validator requires login / those validators are partly deprecated — asset

* meta verified programmatically; live crawler render is an optional manual paste-test.

### 4. D-02 read-only API-Health (no-secrets / Bearer-gated writes)

expected: In the API-Health surface, read-only views expose no secrets/tokens, and all write/operator actions still require a valid Bearer (the automated Bearer-gate tests pass; this is the human spot-check that nothing sensitive leaks in the rendered read-only view).
result: pass
evidence: |
Verified on live prod (deploy 32017ef):

- Unauthenticated API-Health trigger opens a "Dashboard access" password gate (DashboardAuthModal).
  Full-page DOM innerText + outerHTML scanned for secret-shaped tokens (Bearer values, dashboard
  password, 32+ hex, JWT eyJ.., nvapi-, sk-, api/secret/access-key keywords, upstash/redis):
  ZERO matches. Placeholder is the env-var NAME, not a value. Screenshot phase41-check4-api-health.png.
- Write/operator endpoints WITHOUT valid Bearer all 401:
  POST /api/events/llm-replay/:groupKey → 401 (no Bearer AND bad Bearer),
  POST /api/events/prune-dead-urls → 401, GET /api/cron/refresh-events?force=true → 401,
  GET /api/operator-status (aggregator) → 401.
- Automated Bearer-gate / auth / operator / secret / read-only test selection: 109 passed, 0 failed.
  DEFERRED (covered by automated component tests): inspecting the password-UNLOCKED read-only
  observability view on live prod requires the prod DASHBOARD_PASSWORD; the no-secret-leak property
  of the unlocked view is asserted by the D-02 component tests. Optional human follow-up.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — all 4 checks pass; 1 minor cosmetic observation on test 2 (step-4 spotlight offset) and 2 flagged optional human follow-ups (test 3 crawler paste-test, test 4 unlocked-view inspection), none blocking]
