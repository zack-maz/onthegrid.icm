---
status: diagnosed
phase: 03-api-proxy
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md]
started: 2026-03-15T04:00:00Z
updated: 2026-03-15T04:45:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Run `npx tsx server/index.ts` with your `.env` configured. Server boots on port 3001 without crashing. `curl http://localhost:3001/health` returns 200 JSON.
result: issue
reported: "[server] Failed to start: Missing required env var: OPENSKY_CLIENT_ID"
severity: major

### 2. Concurrent Dev Script
expected: Run `npm run dev`. Both Vite (frontend on port 5173) and Express (API on port 3001) start concurrently. You see output from both processes in the terminal.
result: issue
reported: "[server] node: .env: not found — tsx --env-file .env watch server/index.ts exited with code 9"
severity: major

### 3. API Flights Endpoint Shape
expected: With server running, `curl http://localhost:3001/api/flights` returns a JSON response with `{ data, stale, lastFresh }` shape. Without valid OpenSky credentials it may return an error, but the route exists and responds (not 404).
result: skipped
reason: Server not running (blocked by test 1/2 failures)

### 4. API Ships Endpoint Shape
expected: `curl http://localhost:3001/api/ships` returns a JSON response with `{ data, stale, lastFresh }` shape. Without AISStream connected it returns empty data, but the route exists (not 404).
result: skipped
reason: Server not running (blocked by test 1/2 failures)

### 5. API Events Endpoint Shape
expected: `curl http://localhost:3001/api/events` returns a JSON response with `{ data, stale, lastFresh }` shape. Without valid ACLED credentials it may error, but the route exists (not 404).
result: skipped
reason: Server not running (blocked by test 1/2 failures)

### 6. CORS Headers Present
expected: `curl -I -X OPTIONS http://localhost:3001/api/flights` returns CORS headers (Access-Control-Allow-Origin). The frontend on a different port can call these endpoints without browser CORS errors.
result: skipped
reason: Server not running (blocked by test 1/2 failures)

### 7. Environment Template
expected: `.env.example` file exists at project root with all 7 required variables documented (OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET, AISSTREAM_API_KEY, ACLED_EMAIL, ACLED_PASSWORD, PORT, VITE_API_URL). Each has instructions on where to obtain the credential.
result: pass

## Summary

total: 7
passed: 1
issues: 2
pending: 0
skipped: 4

## Gaps

- truth: "Server boots on port 3001 without crashing with .env configured"
  status: failed
  reason: "User reported: [server] Failed to start: Missing required env var: OPENSKY_CLIENT_ID"
  severity: major
  test: 1
  root_cause: "server/index.ts calls loadConfig() eagerly at lines 11 (inside createApp) and 40 (in isMainModule block), validating all credentials at startup. The lazy Proxy pattern in config.ts is correct but bypassed by direct loadConfig() calls."
  artifacts:
    - path: "server/index.ts"
      issue: "Lines 11 and 40 call loadConfig() eagerly, defeating lazy config pattern"
    - path: "server/config.ts"
      issue: "loadConfig() validates all credentials unconditionally — working as designed but called too early"
  missing:
    - "Remove loadConfig() calls from server/index.ts, use process.env.PORT with defaults for listen()"
    - "Use lazy config Proxy for adapter credentials only when endpoints are called"
    - "Guard connectAISStream() call behind env var check or make opt-in"
  debug_session: ".planning/debug/server-eager-config-crash.md"
- truth: "npm run dev starts both Vite and Express concurrently with visible output"
  status: failed
  reason: "User reported: [server] node: .env: not found — tsx --env-file .env watch server/index.ts exited with code 9"
  severity: major
  test: 2
  root_cause: ".env file does not exist at project root. dev:server script uses tsx --env-file .env which requires the file to exist. .env.example is present but was never copied."
  artifacts:
    - path: "package.json"
      issue: "dev:server script uses --env-file .env which crashes if .env is missing"
  missing:
    - "Make --env-file graceful: use dotenv package, or guard script with .env existence check"
    - "Document cp .env.example .env as required setup step"
  debug_session: ".planning/debug/env-file-not-found.md"
