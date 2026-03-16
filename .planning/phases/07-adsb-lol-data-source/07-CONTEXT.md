# Phase 7: adsb.lol Data Source - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

adsb.lol as a third flight data source alongside OpenSky and ADS-B Exchange. Free, no API key, community-driven, same V2 response format as ADS-B Exchange. Server-side adapter with shared normalization, updated SourceSelector dropdown (3 options), 30s polling, and a new /api/sources config endpoint. Also introduces disabled-state treatment for unconfigured sources in the dropdown.

</domain>

<decisions>
## Implementation Decisions

### Source labeling
- Dropdown label: "adsb.lol" (lowercase, matches service name)
- FlightSource type value: `'adsblol'` — no hyphens, consistent with `'opensky'` and `'adsb'` pattern
- Query param: `/api/flights?source=adsblol`
- localStorage key value: `"adsblol"`

### Adapter architecture
- Extract shared V2 normalization into `server/adapters/adsb-v2-normalize.ts`
- Both `adsb-exchange.ts` and `adsb-lol.ts` import the shared normalizer
- `adsb-lol.ts` only handles fetch (no auth headers — free API)
- `adsb-exchange.ts` handles fetch with RapidAPI headers
- Same 250 NM radius from Iran center (32.5, 53.75) as ADS-B Exchange

### Default source
- Default source changes from `'opensky'` to `'adsblol'` — best out-of-box experience (no config required)
- Existing users with saved localStorage preference keep their saved choice (no migration)
- Only new/fresh installs get adsb.lol as default

### Unconfigured source visibility
- Sources missing required credentials shown in dropdown but **disabled/grayed out** with "(API key required)" hint
- Consistent treatment: applies to both OpenSky (needs CLIENT_ID/SECRET) and ADS-B Exchange (needs ADSB_EXCHANGE_API_KEY)
- adsb.lol is always available (no credentials needed)
- New `GET /api/sources` endpoint returns configuration status per source — frontend calls once on load to build the dropdown
- Response shape: `{ opensky: { configured: boolean }, adsb: { configured: boolean }, adsblol: { configured: true } }` (adsblol always true)

### Polling
- 30-second polling interval for adsb.lol (respectful of community API with dynamic rate limits)
- Same recursive setTimeout pattern as other sources

### Claude's Discretion
- Exact disabled styling for unconfigured sources in dropdown (grayed text, cursor, etc.)
- How /api/sources endpoint is wired (inline in flights router or separate route file)
- Whether to add adsb.lol polling constant to server/constants.ts or client-side constants
- Test structure for shared normalizer extraction
- How frontend fetches /api/sources (on mount, cached, etc.)

</decisions>

<specifics>
## Specific Ideas

- adsb.lol is a drop-in replacement for ADS-B Exchange V2 API — same response format, different base URL, no auth
- Base URL: `api.adsb.lol` (no RapidAPI intermediary)
- Same endpoint pattern: `/v2/lat/{lat}/lon/{lon}/dist/{dist}/`
- Dynamic rate limits based on server load (not a fixed monthly quota like ADS-B Exchange)
- The shared normalizer extraction is a refactor of existing adsb-exchange.ts code — normalizeAircraft() and the AdsbAircraft/AdsbResponse interfaces move to the shared module

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/adapters/adsb-exchange.ts`: normalizeAircraft() and interfaces to extract into shared module
- `server/constants.ts`: IRAN_CENTER, ADSB_RADIUS_NM already defined — reused by adsb-lol adapter
- `server/constants.ts`: KNOTS_TO_MS, FEET_TO_METERS, FPM_TO_MS conversion constants — already shared
- `server/routes/flights.ts`: Source dispatch pattern with per-source caching — extend with third source
- `src/components/ui/SourceSelector.tsx`: SOURCE_LABELS and SOURCES arrays — extend with third entry
- `src/types/ui.ts`: FlightSource union type — add 'adsblol'
- `src/stores/flightStore.ts`: activeSource default value — change from 'opensky' to 'adsblol'
- `src/hooks/useFlightPolling.ts`: Source-specific polling interval logic — add adsblol case

### Established Patterns
- Zustand 5 curried create<T>()() for type inference
- Zustand selector s => s.field for minimal re-renders
- EntityCache with source-specific TTL
- Recursive setTimeout polling with tab visibility awareness
- FlightSource type in ui.ts (not server types) to avoid circular imports

### Integration Points
- `server/routes/flights.ts` line 15: source parsing — add 'adsblol' case
- `server/routes/flights.ts` line 19: API key check — adsblol needs no key check
- `src/hooks/useFlightPolling.ts`: Polling interval map — add adsblol: 30_000
- `src/components/ui/SourceSelector.tsx` line 7-10: SOURCE_LABELS — add adsblol entry
- `src/components/ui/SourceSelector.tsx` line 12: SOURCES array — add 'adsblol'
- New route or endpoint needed: GET /api/sources for config status

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-adsb-lol-data-source*
*Context gathered: 2026-03-16*
