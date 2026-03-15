---
status: diagnosed
trigger: "Server crashes at startup with 'Missing required env var: OPENSKY_CLIENT_ID'. Config should be lazy but is validated eagerly."
created: 2026-03-14T00:00:00Z
updated: 2026-03-14T00:00:00Z
---

## Current Focus

hypothesis: loadConfig() is called eagerly in createApp() at server/index.ts:11, which validates all env vars immediately at boot
test: trace the startup call chain
expecting: loadConfig() should only be called when adapter endpoints are hit
next_action: return diagnosis (find_root_cause_only mode)

## Symptoms

expected: Server boots and serves /health even without API credentials
actual: Server crashes with "Missing required env var: OPENSKY_CLIENT_ID" before any routes can respond
errors: "Missing required env var: OPENSKY_CLIENT_ID"
reproduction: Start server without OPENSKY_CLIENT_ID set in environment
started: Since config validation was implemented

## Eliminated

(none needed -- root cause identified on first pass)

## Evidence

- timestamp: 2026-03-14T00:00:00Z
  checked: server/index.ts createApp() function
  found: Line 11 calls loadConfig() directly at the top of createApp(). This immediately validates ALL env vars via the required() helper.
  implication: PRIMARY root cause -- config is validated the moment createApp() is called, before any request arrives.

- timestamp: 2026-03-14T00:00:00Z
  checked: server/index.ts isMainModule block (lines 38-55)
  found: Line 40 calls loadConfig() AGAIN as a standalone call before createApp(). Double eager validation.
  implication: SECONDARY trigger -- even if createApp() were fixed, the isMainModule startup block would also crash.

- timestamp: 2026-03-14T00:00:00Z
  checked: server/config.ts Proxy export (lines 55-59)
  found: The `config` Proxy export IS correctly lazy -- it only calls getConfig() when a property is accessed, not at import time.
  implication: The Proxy-based lazy pattern is correct; the problem is that server/index.ts bypasses it by calling loadConfig() directly.

- timestamp: 2026-03-14T00:00:00Z
  checked: server/adapters/opensky.ts, acled.ts, aisstream.ts imports
  found: All three adapters import the Proxy `config` (not loadConfig). They access config properties only inside functions (getOAuthToken, getACLEDToken, connectAISStream's open handler). No top-level property access.
  implication: Adapters are NOT the problem. They correctly defer config access to runtime function calls.

- timestamp: 2026-03-14T00:00:00Z
  checked: server/index.ts line 45 -- connectAISStream() call
  found: Called in the isMainModule block. connectAISStream() itself does not access config at import time, only inside the 'open' WebSocket handler. However, it IS called eagerly at startup.
  implication: connectAISStream() will access config.aisstream.apiKey the moment the WebSocket connects (seconds after boot), which is a secondary eager-access issue, but not the crash cause since loadConfig() on line 40 crashes first.

## Resolution

root_cause: |
  TWO calls to loadConfig() happen eagerly at startup, both in server/index.ts:

  1. Line 40: `const config = loadConfig();` in the isMainModule block -- validates all env vars before the app even starts.
  2. Line 11: `const config = loadConfig();` inside createApp() -- validates all env vars when building the Express app.

  loadConfig() (server/config.ts:29-45) constructs the full AppConfig object and calls required() for ALL credentials (OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET, AISSTREAM_API_KEY, ACLED_EMAIL, ACLED_PASSWORD). The required() helper throws immediately if any env var is missing.

  The adapters themselves are correctly lazy -- they import the Proxy-based `config` export and only access properties inside async functions. The bug is entirely in server/index.ts calling loadConfig() directly instead of using the lazy Proxy or deferring validation.

fix: (not applied -- diagnosis only)
verification: (not applied -- diagnosis only)
files_changed: []
