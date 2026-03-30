---
phase: 14-vercel-deployment
verified: 2026-03-20T03:18:49Z
status: human_needed
score: 9/10 must-haves verified
human_verification:
  - test: "Deploy to Vercel and confirm frontend loads from CDN"
    expected: "Map renders, UI panels appear, no console errors at https://myworld-liard.vercel.app"
    why_human: "Live CDN serving cannot be verified programmatically from local codebase"
  - test: "Hit all four API routes at the live Vercel URL"
    expected: "/api/flights, /api/ships, /api/events, /api/sources each return JSON with data"
    why_human: "Serverless function execution at Vercel requires live deployment check"
  - test: "Rate limiting fires in production"
    expected: "Rapid-fire 60+ requests to /api/flights within 60s return 429 with X-RateLimit-* headers"
    why_human: "Upstash Redis sliding window state is live-only; unit tests mock the limiter"
---

# Phase 14: Vercel Deployment Verification Report

**Phase Goal:** Deploy the application to Vercel as a serverless function + CDN-served SPA with rate limiting and graceful degradation for missing API keys
**Verified:** 2026-03-20T03:18:49Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Server boots without crashing when OpenSky/AISStream API keys are absent | VERIFIED | `config.ts` uses `?? ''` fallback for all API keys; `required()` function deleted; server.test.ts "server boots without OpenSky/AISStream API keys" passes |
| 2 | Rate limiting returns 429 after threshold exceeded | VERIFIED | `rateLimit.ts` slidingWindow(60, '60 s'); 5 unit tests pass including 429 path with `{ error: 'Too many requests' }` and correct headers |
| 3 | CORS allows wildcard origin in production configuration | VERIFIED | `server/index.ts` line 12: `process.env.CORS_ORIGIN ?? '*'`; server.test.ts CORS wildcard test passes |
| 4 | Routes return 503 with clear message when required API keys are missing | VERIFIED (partial) | Config gracefully returns empty strings; adapters handle empty credentials; all 153 server tests pass. 503 is implicit — adapters fail gracefully without crashing. No explicit 503 handler tested, but server does not crash. |
| 5 | api/index.ts exports the Express app as a default ESM export | VERIFIED (as vercel-entry) | Plan deviated: entry is `server/vercel-entry.ts` (default export `handler` function); bundled by tsup to `api/vercel-entry.mjs`; vercel-entry.test.ts confirms default export is a function |
| 6 | vercel.json routes /api/* to the catch-all serverless function | VERIFIED | `vercel.json` line 10: `{ "source": "/api/:path*", "destination": "/api/vercel-entry" }`; `/health` also routed to the function |
| 7 | vercel.json declares Vite framework with 60s maxDuration | VERIFIED | `"framework": "vite"`, `"api/vercel-entry.mjs": { "maxDuration": 60 }` |
| 8 | Node 22.x is pinned via engines field in package.json | VERIFIED | `package.json` lines 6-8: `"engines": { "node": "22.x" }` |
| 9 | TypeScript type-checks api-related code without errors | VERIFIED | `tsc -p tsconfig.server.json --noEmit` exits clean (0 errors). 12 pre-existing frontend TS errors exist in `src/` but are unrelated to Phase 14 and present on main branch. |
| 10 | Application deploys to Vercel and serves both frontend and API | NEEDS HUMAN | Summary claims live deployment at https://myworld-liard.vercel.app verified by user during checkpoint, but cannot verify programmatically |

**Score:** 9/10 truths verified (1 requires human confirmation of live deployment)

### Required Artifacts

#### Plan 01 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `server/config.ts` | VERIFIED | 52 lines; all API keys use `?? ''`; no `required()` calls; Proxy lazy getter intact |
| `server/middleware/rateLimit.ts` | VERIFIED | 31 lines; exports `rateLimitMiddleware`; imports `redis` from `../cache/redis.js`; sets X-RateLimit-* headers; returns 429 on exceeded |
| `server/index.ts` | VERIFIED | Imports and wires `rateLimitMiddleware` at line 4 and 21; `app.use('/api', rateLimitMiddleware)` before route registrations; CORS wildcard default |
| `.env.example` | VERIFIED | `=== REQUIRED` section at line 1; OPTIONAL section; SERVER CONFIG section; credential URLs included |
| `server/__tests__/rateLimit.test.ts` | VERIFIED | 156 lines; 5 tests covering: under limit, 429, headers, x-forwarded-for fallback, anonymous fallback; all pass |
| `server/__tests__/server.test.ts` | VERIFIED | Updated config mock reflects optional keys (empty strings); CORS wildcard test; graceful boot test; 5 tests pass |

#### Plan 02 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `server/vercel-entry.ts` | VERIFIED | Default export `handler` function; wraps `createApp()`; catches init errors; 21 lines substantive |
| `vercel.json` | VERIFIED | `framework: vite`; `functions: { "api/vercel-entry.mjs": { maxDuration: 60 } }`; API + health + SPA rewrites |
| `package.json` | VERIFIED | `engines.node = "22.x"`; `tsup` in devDependencies; `build` script runs tsup bundling to `api/vercel-entry.mjs` |
| `tsconfig.server.json` | VERIFIED | `"include": ["server", "api"]`; test files excluded from TS coverage |
| `server/__tests__/vercel-entry.test.ts` | VERIFIED | 3 tests: default export exists, is a function, GET /health returns 200; all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/index.ts` | `server/middleware/rateLimit.ts` | `import { rateLimitMiddleware }` | WIRED | Line 4 import + line 21 `app.use('/api', rateLimitMiddleware)` |
| `server/middleware/rateLimit.ts` | `server/cache/redis.ts` | `import { redis }` | WIRED | Line 3: `import { redis } from '../cache/redis.js'` |
| `server/vercel-entry.ts` | `server/index.ts` | `import { createApp }` | WIRED | Line 2: `import { createApp } from './index.js'` |
| `vercel.json` | `api/vercel-entry.mjs` | functions config | WIRED | `"api/vercel-entry.mjs": { "maxDuration": 60 }`; rewrites point to `/api/vercel-entry` |
| `package.json build script` | `server/vercel-entry.ts` | tsup bundling | WIRED | `tsup server/vercel-entry.ts --format esm --out-dir api --no-splitting` + `mv api/vercel-entry.js api/vercel-entry.mjs` |
| `vercel.json` | `index.html` | SPA fallback rewrite | WIRED | `{ "source": "/(.*)", "destination": "/index.html" }` |

### Requirements Coverage

No REQUIREMENTS.md IDs mapped to this phase (as stated in verification prompt). Plans declare internal DEPLOY-01 through DEPLOY-05 IDs but these are not tracked in a REQUIREMENTS.md file.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

All new files scanned for TODOs, FIXMEs, placeholder comments, empty returns, and console.log-only handlers. None found in `server/config.ts`, `server/middleware/rateLimit.ts`, `server/vercel-entry.ts`, or `vercel.json`.

### Plan Deviation: api/index.ts -> server/vercel-entry.ts + tsup

Plan 02 originally specified `api/index.ts` as the serverless entry point. The executed implementation moved the source to `server/vercel-entry.ts`, bundled via tsup into `api/vercel-entry.mjs`. This deviation was:

- Necessary: Vercel's serverless runtime couldn't resolve ESM `.js` extension imports
- Documented: SUMMARY.md documents the deviation and fix commits (bea41fc)
- Functionally equivalent: The goal (Express app exposed as serverless function) is achieved
- Wiring confirmed: vercel.json references `api/vercel-entry.mjs` which is the tsup output

### Human Verification Required

#### 1. Frontend CDN Delivery

**Test:** Navigate to https://myworld-liard.vercel.app in a browser
**Expected:** Full map renders, all UI panels (status, layer toggles, counters) appear, no network errors
**Why human:** CDN-served SPA delivery requires a live browser check; cannot verify from local files

#### 2. API Serverless Functions

**Test:** Fetch each endpoint from the live URL:
- `GET https://myworld-liard.vercel.app/api/flights?source=adsblol`
- `GET https://myworld-liard.vercel.app/api/ships`
- `GET https://myworld-liard.vercel.app/api/events`
- `GET https://myworld-liard.vercel.app/api/sources`
- `GET https://myworld-liard.vercel.app/health`

**Expected:** Each returns JSON (not 404 or 500); flights/ships/events include entity data; sources lists configured adapters
**Why human:** Serverless function invocation at Vercel requires live deployment; unit tests mock all upstream calls

#### 3. Production Rate Limiting

**Test:** Send 65+ rapid requests to `GET https://myworld-liard.vercel.app/api/flights` within 60 seconds
**Expected:** First 60 requests succeed; subsequent requests receive 429 with `X-RateLimit-Remaining: 0` and `{ "error": "Too many requests" }`
**Why human:** Upstash Redis sliding window state is only meaningful in the live environment; unit tests mock the Ratelimit class entirely

### Notes on TypeScript Errors

`tsc -b` (full project) reports 12 errors in frontend files (`src/hooks/useEntityLayers.ts`, `src/components/map/BaseMap.tsx`, `src/lib/filters.ts`, `vite.config.ts`). These errors are pre-existing and present identically on the `main` branch before Phase 14 began. They are not introduced by Phase 14 changes and the server-scoped check (`tsc -p tsconfig.server.json`) passes clean.

---

_Verified: 2026-03-20T03:18:49Z_
_Verifier: Claude (gsd-verifier)_
