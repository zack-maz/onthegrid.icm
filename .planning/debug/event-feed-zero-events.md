---
status: diagnosed
trigger: "Events line shows 0 events and no /api/events polling in Network tab"
created: 2026-03-17T10:30:00Z
updated: 2026-03-17T10:50:00Z
---

## Current Focus

hypothesis: CONFIRMED - Server returns 500 on /api/events (ACLED credentials invalid), client silently processes error response, 300s poll interval hides the failure
test: curl http://localhost:3001/api/events
expecting: 500 with error JSON
next_action: Return diagnosis

## Symptoms

expected: Events line shows green dot with event count; Network tab shows /api/events polling every ~300s
actual: Events line shows 0 events; Network tab shows no /api/events requests
errors: None visible to user (silent failure)
reproduction: Start app with ACLED credentials, observe StatusPanel events line
started: First observation during UAT test 5

## Eliminated

- hypothesis: useEventPolling hook not wired in AppShell
  evidence: Confirmed present at AppShell.tsx line 15 - useEventPolling() is called
  timestamp: 2026-03-17T10:35:00Z

- hypothesis: Missing ACLED credentials in .env
  evidence: Both ACLED_EMAIL and ACLED_PASSWORD present with non-placeholder values
  timestamp: 2026-03-17T10:38:00Z

- hypothesis: Server config.ts loadConfig() crashes on missing env vars
  evidence: All 5 required env vars (OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET, AISSTREAM_API_KEY, ACLED_EMAIL, ACLED_PASSWORD) are present in .env
  timestamp: 2026-03-17T10:40:00Z

- hypothesis: TypeScript compilation error preventing hook from loading
  evidence: All types (ConflictEventEntity, CacheResponse) properly defined and re-exported; no import errors
  timestamp: 2026-03-17T10:41:00Z

## Evidence

- timestamp: 2026-03-17T10:35:00Z
  checked: src/hooks/useEventPolling.ts lines 20-23
  found: fetch('/api/events') does NOT check res.ok before calling res.json() and setEventData()
  implication: On server 500 response, the JSON { error: 'Internal server error' } is parsed and passed to setEventData() where response.data is undefined

- timestamp: 2026-03-17T10:36:00Z
  checked: src/stores/eventStore.ts setEventData action
  found: Does response.data.length which throws TypeError when response.data is undefined
  implication: TypeError is caught by useEventPolling catch block, which calls setError() - events stay at 0 with error status

- timestamp: 2026-03-17T10:37:00Z
  checked: EVENT_POLL_INTERVAL constant
  found: Poll interval is 300,000ms (5 minutes)
  implication: After the initial failed request, next retry is 5 minutes later - user sees no network activity

- timestamp: 2026-03-17T10:39:00Z
  checked: server/routes/events.ts - events route handler
  found: No cache-first check (unlike flights route); always calls fetchEvents() which hits ACLED API
  implication: Every request depends on ACLED API availability and valid credentials

- timestamp: 2026-03-17T10:42:00Z
  checked: server/adapters/acled.ts - getACLEDToken()
  found: Uses OAuth2 password grant flow with config.acled.email and config.acled.password
  implication: If ACLED account is invalid/unregistered/expired, token request fails, route returns 500

- timestamp: 2026-03-17T10:43:00Z
  checked: Compared useEventPolling.ts with useFlightPolling.ts and useShipPolling.ts
  found: ALL three hooks have the same bug - none check res.ok before processing response
  implication: This is a systemic pattern, but flights work because adsb.lol rarely fails

- timestamp: 2026-03-17T10:48:00Z
  checked: curl http://localhost:3001/api/events (live server test)
  found: Returns HTTP 500 with {"error":"Internal server error"}
  implication: CONFIRMED - server-side failure causes the client-side silent error chain

- timestamp: 2026-03-17T10:49:00Z
  checked: ACLED OAuth2 endpoint (curl test with dummy creds)
  found: ACLED API is reachable, returns 400 on invalid credentials
  implication: The ACLED credentials in .env are likely invalid (wrong email/password, expired account, or unactivated registration)

- timestamp: 2026-03-17T10:50:00Z
  checked: Node.js --env-file parsing of ACLED_PASSWORD containing & character
  found: Node.js correctly parses &HelloWorld987 - special chars are not the issue
  implication: The env var loading is correct; the credentials themselves are likely the problem

## Resolution

root_cause: |
  The /api/events endpoint returns HTTP 500 because ACLED OAuth2 authentication fails.
  The ACLED adapter (server/adapters/acled.ts) requests a token using the email/password from .env,
  but the ACLED API rejects the credentials (likely invalid, expired, or unactivated account).

  This server error is then SILENTLY SWALLOWED by the client because useEventPolling.ts
  does not check res.ok before processing the response. The error JSON { error: "Internal server error" }
  is passed to setEventData(), which throws TypeError on undefined .data, caught by the catch block
  that calls setError(). The store shows 0 events with error status.

  The 300-second poll interval means no retry for 5 minutes, so the user sees zero network activity
  after the single initial failed request (which they likely missed if DevTools was opened after page load).
fix:
verification:
files_changed: []
