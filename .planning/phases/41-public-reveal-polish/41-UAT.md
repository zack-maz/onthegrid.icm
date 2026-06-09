---
status: testing
phase: 41-public-reveal-polish
source: [41-VERIFICATION.md]
started: 2026-06-06T02:07:14Z
updated: 2026-06-06T02:07:14Z
---

## Current Test

number: 1
name: Intro overlay first-visit render + persistence
expected: |
On a fresh browser profile (or after clearing the `iran-monitor.intro-seen`
localStorage key), loading the app shows the IntroOverlay (data-testid="intro-overlay").
Clicking "Explore the map" dismisses it AND it stays dismissed across reloads.
Clicking "Start the tour" dismisses the overlay AND opens the guided tour.
awaiting: user response

## Tests

### 1. Intro overlay first-visit render + persistence

expected: Fresh profile / cleared `iran-monitor.intro-seen` → overlay appears; "Explore the map" dismisses and persists across reload; "Start the tour" dismisses + opens tour. Escape also dismisses (Priority 0 in the centralized key stack — must not fall through to reset-camera under the backdrop).
result: [pending]

### 2. Guided tour spotlight geometry (WR-01 fix)

expected: Triggering the tour (TourTrigger, data-testid="tour-trigger") steps through all 5 driver.js steps; each spotlight lands on the intended on-screen HUD node — step 2 opens the Sidebar Layers section before spotlighting it, step 4 opens the detail panel before spotlighting it (the WR-01 fix added `onHighlightStarted` panel-open hooks); no spotlight lands on an empty/off-viewport region. Panel state is restored when the tour ends.
result: [pending]

### 3. OG / Twitter social-share card preview (post-deploy)

expected: After deploying to production, the LinkedIn Post Inspector and Twitter/X Card Validator (and a direct paste preview) render the share card from `https://otg-iran-monitor.vercel.app/screenshots/og-card.png` at 1200×630 with the correct title/description. (Cannot be verified pre-deploy — crawlers fetch the live URL.)
result: [pending]

### 4. D-02 read-only API-Health (no-secrets / Bearer-gated writes)

expected: In the API-Health surface, read-only views expose no secrets/tokens, and all write/operator actions still require a valid Bearer (the automated Bearer-gate tests pass; this is the human spot-check that nothing sensitive leaks in the rendered read-only view).
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
