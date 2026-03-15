# Phase 3: API Proxy - Research

**Researched:** 2026-03-14
**Domain:** Express.js backend proxy, upstream API integration (OpenSky, AISStream, ACLED), data normalization
**Confidence:** HIGH

## Summary

This phase creates an Express 5 backend proxy server that sits between the React frontend and three external data APIs: OpenSky Network (flights), AISStream.io (ships via WebSocket), and ACLED (conflict events). The proxy shields the frontend from CORS issues, manages API keys via environment variables, normalizes all upstream responses into a common `MapEntity` discriminated union, and provides in-memory caching with staleness indicators.

The server runs alongside Vite in development using `concurrently`, with `tsx watch` for instant TypeScript restarts. Since the project uses Node.js v25.6.1, we can use the native `--env-file` flag instead of the `dotenv` package, and the native WebSocket client API (stable since Node.js v22.4.0) for the AISStream.io connection instead of the `ws` library.

**Primary recommendation:** Use Express 5 with native async error handling, native Node.js `--env-file` for environment variables, native `WebSocket` for AISStream.io, and `node-fetch` is unnecessary (native `fetch` is stable). Keep the server lean -- only express, cors, and concurrently+tsx as dependencies.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Minimal shared fields: `id`, `type`, `lat`, `lng`, `timestamp`, `label` -- just enough to place on map and identify
- Type-specific data in a nested object (discriminated union pattern)
- Four entity types: `flight`, `ship`, `missile`, `drone`
- Proxy normalizes all upstream API responses into `MapEntity` format before sending to frontend
- Separate endpoints per data source: `/api/flights`, `/api/ships`, `/api/events`
- OpenSky: Register for free account to get higher rate limits (~1 req/5s) meeting the 5s refresh target
- AIS ship data: Use AISStream.io WebSocket API (free, real-time push, requires free API key signup)
- ACLED conflict events: Fetch last 7 days of data (ACLED has ~24-48hr reporting delay)
- When upstream API is down/rate-limited: serve stale cache with staleness indicator (`stale: true`, `lastFresh: timestamp`)
- In-memory cache only (no disk persistence) -- cache refills quickly from upstream APIs on restart
- Proxy-side bounding box filter -- send bbox params to upstream APIs, focused on Iran/Middle East region
- Minimal console logging for upstream request/response times and errors
- Server code in `server/` directory at project root alongside `src/`
- Shared `package.json` -- single repo, not workspaces
- `npm run dev` starts both Vite (frontend) and Express (backend) via `concurrently`
- Server runs with `tsx watch server/index.ts` -- no build step, instant restarts
- Express server on port 3001, Vite frontend on default port
- API keys stored in `.env` file at project root

### Claude's Discretion
- Exact MapEntity TypeScript interfaces and discriminated union implementation
- Cache TTL values per data source
- Express middleware setup and error handling patterns
- Adapter module structure within `server/adapters/`
- `.env` variable naming conventions

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Express API proxy for CORS handling, API key management, and data normalization | Full research on Express 5 setup, CORS middleware, all three upstream API formats, MapEntity normalization pattern, env variable management |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | ^5.1 | HTTP server and routing | Stable since Oct 2024, native async error handling, project decision |
| cors | ^2.8 | CORS middleware | De facto standard Express CORS solution, TypeScript-typed |
| concurrently | ^9.x | Run Vite + Express in parallel | Standard for monorepo dev scripts |
| tsx | ^4.x | TypeScript execution with watch mode | Fastest TS runner for Node.js, esbuild-backed, built-in watch |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/express | ^5.x | Express TypeScript types | Always -- strict mode requires them |
| @types/cors | ^2.8 | CORS middleware types | Always -- TypeScript strict mode |

### NOT Needed (Native Alternatives)
| Library | Why Not Needed | Native Alternative |
|---------|----------------|-------------------|
| dotenv | Node.js v20.6+ has native support | `--env-file .env` flag on node/tsx |
| node-fetch | Node.js v21+ has native fetch | Global `fetch()` API |
| ws | Node.js v22.4+ has stable WebSocket client | Global `WebSocket` class |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| express | fastify | Fastify is faster but Express was a project decision; Express 5 closes the gap |
| cors package | Manual headers | cors package handles preflight, credentials, and edge cases correctly |
| tsx watch | node --watch | tsx handles TypeScript natively; node --watch needs separate TS compilation |

**Installation:**
```bash
npm install express cors
npm install -D @types/express @types/cors concurrently tsx
```

## Architecture Patterns

### Recommended Project Structure
```
server/
  index.ts              # Express app setup, middleware, route mounting
  config.ts             # Environment variable validation and export
  types.ts              # MapEntity types (shared with src/types/entities.ts)
  middleware/
    errorHandler.ts     # Global error handling middleware
  adapters/
    opensky.ts          # OpenSky API adapter -> MapEntity[]
    aisstream.ts        # AISStream WebSocket adapter -> MapEntity[]
    acled.ts            # ACLED API adapter -> MapEntity[]
  cache/
    entityCache.ts      # In-memory cache with TTL and staleness tracking
  routes/
    flights.ts          # GET /api/flights
    ships.ts            # GET /api/ships
    events.ts           # GET /api/events
```

### Pattern 1: Discriminated Union MapEntity
**What:** A TypeScript discriminated union where all entities share base fields but carry type-specific data in a nested object.
**When to use:** Always -- this is the core data contract between proxy and frontend.
**Example:**
```typescript
// Shared base fields (minimal per user decision)
interface MapEntityBase {
  id: string;
  type: EntityType;
  lat: number;
  lng: number;
  timestamp: number;  // Unix ms
  label: string;
}

type EntityType = 'flight' | 'ship' | 'missile' | 'drone';

interface FlightEntity extends MapEntityBase {
  type: 'flight';
  data: {
    icao24: string;
    callsign: string;
    originCountry: string;
    velocity: number | null;     // m/s
    heading: number | null;      // degrees
    altitude: number | null;     // meters
    onGround: boolean;
    verticalRate: number | null; // m/s
  };
}

interface ShipEntity extends MapEntityBase {
  type: 'ship';
  data: {
    mmsi: number;
    shipName: string;
    speedOverGround: number;  // knots
    courseOverGround: number;  // degrees
    trueHeading: number;      // degrees
  };
}

interface ConflictEventEntity extends MapEntityBase {
  type: 'missile' | 'drone';
  data: {
    eventType: string;       // ACLED event_type
    subEventType: string;    // ACLED sub_event_type
    fatalities: number;
    actor1: string;
    actor2: string;
    notes: string;
    source: string;
  };
}

type MapEntity = FlightEntity | ShipEntity | ConflictEventEntity;
```

### Pattern 2: Adapter Pattern for API Normalization
**What:** Each upstream API has its own adapter module that handles fetching, parsing, and normalizing to MapEntity format.
**When to use:** For every data source. Isolates upstream API changes from the rest of the system.
**Example:**
```typescript
// server/adapters/opensky.ts
interface OpenSkyStateVector {
  // Raw API response fields (array indices mapped to names)
  icao24: string;       // [0]
  callsign: string;     // [1]
  origin_country: string; // [2]
  // ... etc
}

export async function fetchFlights(bbox: BoundingBox): Promise<FlightEntity[]> {
  const url = `https://opensky-network.org/api/states/all?lamin=${bbox.south}&lomin=${bbox.west}&lamax=${bbox.north}&lomax=${bbox.east}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!response.ok) throw new Error(`OpenSky: ${response.status}`);
  const data = await response.json();
  return (data.states ?? []).map(normalizeFlightState);
}
```

### Pattern 3: In-Memory Cache with Staleness
**What:** Simple Map-based cache with TTL, serving stale data when upstream is unavailable.
**When to use:** Every endpoint response should go through cache.
**Example:**
```typescript
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;    // Unix ms when data was last successfully fetched
  stale: boolean;       // true if TTL expired or upstream failed
}

class EntityCache<T> {
  private entry: CacheEntry<T> | null = null;
  constructor(private ttlMs: number) {}

  get(): { data: T; stale: boolean; lastFresh: number } | null {
    if (!this.entry) return null;
    const age = Date.now() - this.entry.fetchedAt;
    return {
      data: this.entry.data,
      stale: age > this.ttlMs,
      lastFresh: this.entry.fetchedAt,
    };
  }

  set(data: T): void {
    this.entry = { data, fetchedAt: Date.now(), stale: false };
  }
}
```

### Pattern 4: Express 5 Native Async Error Handling
**What:** Express 5 automatically catches rejected promises in route handlers and forwards them to error middleware. No wrapper needed.
**When to use:** All async route handlers -- just use `async (req, res) => {}` directly.
**Example:**
```typescript
// Express 5 -- NO asyncHandler wrapper needed
router.get('/api/flights', async (req, res) => {
  const cached = flightCache.get();
  if (cached) {
    return res.json(cached);
  }
  // If this throws, Express 5 catches it automatically
  const flights = await fetchFlights(IRAN_BBOX);
  flightCache.set(flights);
  res.json({ data: flights, stale: false, lastFresh: Date.now() });
});

// Global error handler (unchanged from Express 4)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: 'Internal server error' });
});
```

### Anti-Patterns to Avoid
- **Importing dotenv:** Use `tsx --env-file .env watch server/index.ts` instead. Node.js v25 has native support.
- **Installing ws/node-fetch:** Both are native in Node.js v22+. Adding them is dead weight.
- **Shared tsconfig for server and client:** Server code targets Node.js (no DOM), client targets browser. Use separate tsconfig files.
- **Polling AISStream:** AISStream is WebSocket-push. Do NOT poll it with setInterval + fetch.
- **Exposing raw upstream data:** Always normalize to MapEntity. Leaking upstream schemas couples frontend to external APIs.

## TypeScript Configuration for Server

The server needs its own tsconfig since it targets Node.js, not the browser.

```jsonc
// tsconfig.server.json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "types": ["node"]
  },
  "include": ["server"]
}
```

Then add a reference in the root `tsconfig.json`:
```json
{
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.server.json" }
  ]
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CORS headers | Manual Access-Control-* headers | `cors` package | Handles preflight OPTIONS, credentials, vary headers, and dozens of edge cases |
| OAuth2 token management | Manual token fetch + expiry tracking | A small helper with token caching + auto-refresh | OpenSky tokens expire in 30min; ACLED in 24h. Retry logic is tricky |
| WebSocket reconnection | Simple new WebSocket on close | Reconnect with exponential backoff + jitter | Network blips are common; naive reconnect causes thundering herd |
| Bounding box validation | Ad-hoc lat/lng checks | Typed BoundingBox interface + validation function | Invalid coords silently return empty results from APIs |
| Environment variable validation | Bare process.env access | Config module with required/optional validation | Missing vars cause cryptic runtime errors instead of clear startup failures |

**Key insight:** Each upstream API has its own auth flow (OpenSky OAuth2, AISStream API key header, ACLED OAuth2 password grant). Hand-rolling auth for three different flows is error-prone -- isolate each in its adapter.

## Common Pitfalls

### Pitfall 1: OpenSky Basic Auth Deprecated
**What goes wrong:** Using username:password basic auth fails silently or returns 401.
**Why it happens:** OpenSky deprecated basic auth on March 18, 2026. All accounts must use OAuth2 client credentials flow.
**How to avoid:** Implement OAuth2 token fetch from `https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token` with `client_id` + `client_secret`. Cache the token (30-min expiry) and refresh proactively.
**Warning signs:** 401 responses from OpenSky API.

### Pitfall 2: OpenSky Returns Arrays, Not Objects
**What goes wrong:** Trying to access `state.icao24` on the response fails -- states are positional arrays.
**Why it happens:** OpenSky `/states/all` returns state vectors as arrays of 18 positional values, not named objects. Index 0 = icao24, index 1 = callsign, index 5 = longitude, index 6 = latitude, etc.
**How to avoid:** Map array indices to named fields in the adapter's normalization function. Document the index mapping clearly.
**Warning signs:** `undefined` values when destructuring API responses.

### Pitfall 3: .env Not in .gitignore
**What goes wrong:** API keys get committed to git and exposed in the repository.
**Why it happens:** The current `.gitignore` does not include `.env`. The `*.local` pattern catches `.env.local` but not `.env`.
**How to avoid:** Add `.env` to `.gitignore` BEFORE creating the `.env` file. Also add `.env.*` with an exception for `.env.example`.
**Warning signs:** `git status` shows `.env` as untracked.

### Pitfall 4: AISStream WebSocket Connection Timeout
**What goes wrong:** Connection opens but no data arrives, then silently closes.
**Why it happens:** AISStream requires the subscription message within 3 seconds of connection. If delayed, the connection is terminated.
**How to avoid:** Send the subscription JSON immediately in the `open` event handler. Include the API key and bounding box.
**Warning signs:** WebSocket closes shortly after opening with no messages received.

### Pitfall 5: ACLED OAuth Token Confusion
**What goes wrong:** Authentication fails or tokens expire unexpectedly.
**Why it happens:** ACLED uses OAuth2 password grant (not client credentials like OpenSky). Requires username (email), password, grant_type="password", client_id="acled". Tokens expire in 24 hours; refresh tokens in 14 days.
**How to avoid:** Store ACLED email + password in env vars. Implement token caching with 23-hour TTL (safe margin). Use refresh token flow for extended sessions.
**Warning signs:** 401 or 403 from ACLED API after initial success.

### Pitfall 6: tsx watch + --env-file Interaction
**What goes wrong:** Environment variables not loaded, or watch mode breaks.
**Why it happens:** There can be edge cases with `tsx watch` and `--env-file` combined. The recommended approach is `tsx --env-file .env watch server/index.ts` (flag before `watch` subcommand).
**How to avoid:** Use the correct flag ordering. Test that `process.env.OPENSKY_CLIENT_ID` is defined at startup. Alternatively, use `dotenv` as a fallback if tsx flag ordering causes issues.
**Warning signs:** `process.env.VAR` returns `undefined` despite being in `.env`.

### Pitfall 7: OpenSky Credit Exhaustion
**What goes wrong:** API returns 429 Too Many Requests, flight data goes stale.
**Why it happens:** Authenticated users get 4000-8000 credits/day. Each bbox query costs 1-4 credits depending on area. At 5s refresh = ~17,000 requests/day, far exceeding the limit.
**How to avoid:** Cache aggressively. Use a reasonable polling interval (10-15s minimum for authenticated, longer for anonymous). Serve stale cache on 429. Monitor `X-Rate-Limit-Remaining` header. Reduce bbox to Iran-only (~380 sq deg = 3 credits/req).
**Warning signs:** `X-Rate-Limit-Remaining` header dropping rapidly.

## Upstream API Reference

### OpenSky Network (Flights)
| Property | Value |
|----------|-------|
| Base URL | `https://opensky-network.org/api` |
| Endpoint | `GET /states/all` |
| Auth | OAuth2 client credentials (token endpoint: `https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token`) |
| Token expiry | 30 minutes |
| Bbox params | `lamin`, `lomin`, `lamax`, `lomax` (decimal degrees) |
| Response format | `{ time: number, states: Array<Array<any>> }` -- states are positional arrays |
| State array indices | [0]=icao24, [1]=callsign, [2]=origin_country, [3]=time_position, [4]=last_contact, [5]=longitude, [6]=latitude, [7]=baro_altitude, [8]=on_ground, [9]=velocity, [10]=true_track, [11]=vertical_rate, [12]=sensors, [13]=geo_altitude, [14]=squawk, [15]=spi, [16]=position_source, [17]=category |
| Rate limits | Anonymous: 400 credits/day, 10s resolution. Authenticated: 4000-8000 credits/day, 5s resolution |
| Credit cost | 1-4 credits per request depending on bbox area |

### AISStream.io (Ships)
| Property | Value |
|----------|-------|
| WebSocket URL | `wss://stream.aisstream.io/v0/stream` |
| Auth | API key in subscription message |
| Subscription format | `{ "APIKey": "...", "BoundingBoxes": [[[lat1,lng1],[lat2,lng2]]], "FilterMessageTypes": ["PositionReport"] }` |
| Subscription deadline | Must send within 3 seconds of connection open |
| Message format | `{ MessageType, Message: { PositionReport: { UserID, Latitude, Longitude, Sog, Cog, TrueHeading } }, MetaData: { MMSI, ShipName, latitude, longitude, time_utc } }` |
| Rate limits | Free tier, push-based (no polling needed) |

### ACLED (Conflict Events)
| Property | Value |
|----------|-------|
| Base URL | `https://acleddata.com/api` |
| Endpoint | `GET /acled/read` |
| Auth | OAuth2 password grant (token endpoint: `https://acleddata.com/oauth/token`, client_id="acled", grant_type="password") |
| Token expiry | 24 hours (refresh token: 14 days) |
| Key query params | `country=Iran`, `event_date`, `event_date_where=BETWEEN`, `_format=json`, `fields=...`, `limit=...` |
| Response format | `{ status, success, count, data: Array<EventRecord> }` |
| Event fields | event_id_cnty, event_date, event_type, sub_event_type, actor1, actor2, country, latitude, longitude, fatalities, notes, source, geo_precision |
| Rate limits | Not explicitly documented; use reasonable polling interval (5 min per user decision) |

### Iran/Middle East Bounding Box
```typescript
const IRAN_BBOX = {
  south: 25.0,   // min latitude
  north: 40.0,   // max latitude
  west: 44.0,    // min longitude
  east: 63.5,    // max longitude
};
```
This covers Iran plus immediate neighboring waters (Persian Gulf, Gulf of Oman, Caspian Sea).

## Code Examples

### Server Entry Point
```typescript
// server/index.ts
import express from 'express';
import cors from 'cors';
import { flightsRouter } from './routes/flights.js';
import { shipsRouter } from './routes/ships.js';
import { eventsRouter } from './routes/events.js';
import { errorHandler } from './middleware/errorHandler.js';
import { config } from './config.js';

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.use('/api/flights', flightsRouter);
app.use('/api/ships', shipsRouter);
app.use('/api/events', eventsRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[server] listening on port ${config.port}`);
});
```

### Environment Config with Validation
```typescript
// server/config.ts
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  opensky: {
    clientId: required('OPENSKY_CLIENT_ID'),
    clientSecret: required('OPENSKY_CLIENT_SECRET'),
  },
  aisstream: {
    apiKey: required('AISSTREAM_API_KEY'),
  },
  acled: {
    email: required('ACLED_EMAIL'),
    password: required('ACLED_PASSWORD'),
  },
} as const;
```

### Package.json Scripts Update
```json
{
  "scripts": {
    "dev": "concurrently -n client,server -c blue,green \"vite\" \"tsx --env-file .env watch server/index.ts\"",
    "dev:client": "vite",
    "dev:server": "tsx --env-file .env watch server/index.ts",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  }
}
```

### .env.example
```bash
# OpenSky Network (register at https://opensky-network.org)
# OAuth2 client credentials -- create at OpenSky dashboard
OPENSKY_CLIENT_ID=
OPENSKY_CLIENT_SECRET=

# AISStream.io (register at https://aisstream.io, sign in via GitHub)
AISSTREAM_API_KEY=

# ACLED (register at https://acleddata.com)
ACLED_EMAIL=
ACLED_PASSWORD=

# Server config (optional)
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

### AISStream WebSocket Connection (Native WebSocket)
```typescript
// server/adapters/aisstream.ts
import { config } from '../config.js';
import type { ShipEntity } from '../types.js';
import { IRAN_BBOX } from '../constants.js';

let ships: Map<number, ShipEntity> = new Map();
let lastMessageTime = 0;

export function getShips(): ShipEntity[] {
  return Array.from(ships.values());
}

export function connectAISStream(): void {
  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

  ws.addEventListener('open', () => {
    console.log('[aisstream] connected');
    // MUST send subscription within 3 seconds
    ws.send(JSON.stringify({
      APIKey: config.aisstream.apiKey,
      BoundingBoxes: [
        [[IRAN_BBOX.south, IRAN_BBOX.west], [IRAN_BBOX.north, IRAN_BBOX.east]],
      ],
      FilterMessageTypes: ['PositionReport'],
    }));
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.MessageType === 'PositionReport') {
      const report = msg.Message.PositionReport;
      const meta = msg.MetaData;
      const entity: ShipEntity = {
        id: `ship-${meta.MMSI}`,
        type: 'ship',
        lat: report.Latitude,
        lng: report.Longitude,
        timestamp: new Date(meta.time_utc).getTime(),
        label: meta.ShipName?.trim() || `MMSI ${meta.MMSI}`,
        data: {
          mmsi: meta.MMSI,
          shipName: meta.ShipName?.trim() || '',
          speedOverGround: report.Sog,
          courseOverGround: report.Cog,
          trueHeading: report.TrueHeading,
        },
      };
      ships.set(meta.MMSI, entity);
      lastMessageTime = Date.now();
    }
  });

  ws.addEventListener('close', () => {
    console.log('[aisstream] disconnected, reconnecting in 5s...');
    setTimeout(connectAISStream, 5000);
  });

  ws.addEventListener('error', (err) => {
    console.error('[aisstream] error:', err);
  });
}
```

## Recommended Cache TTL Values

| Data Source | Cache TTL | Rationale |
|-------------|-----------|-----------|
| OpenSky (flights) | 10 seconds | 5s resolution for authenticated, but polling faster than 10s burns credits too fast |
| AISStream (ships) | N/A (push) | WebSocket pushes updates; cache is the live Map of ships |
| ACLED (events) | 5 minutes | Data has 24-48h inherent delay; no benefit to polling faster |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| dotenv package | Native `--env-file` flag | Node.js v20.6 (2023) | One fewer dependency |
| node-fetch | Native `fetch()` | Node.js v21 (2023) | No polyfill needed |
| ws package (client) | Native `WebSocket` | Node.js v22.4 (2024) | One fewer dependency |
| Express 4 + asyncHandler | Express 5 native async | Express 5.0 (Oct 2024) | No wrapper needed for async routes |
| OpenSky basic auth | OpenSky OAuth2 client credentials | March 18, 2026 | BREAKING: basic auth no longer works |

**Deprecated/outdated:**
- OpenSky basic auth: Deprecated March 18, 2026. Must use OAuth2 client credentials flow.
- Express 4: Still works but Express 5 is now `latest` on npm (since v5.1.0, March 2025).
- dotenv: Unnecessary on Node.js v20.6+. Native `--env-file` is simpler and zero-dependency.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vite.config.ts` (test block) |
| Quick run command | `npx vitest run server/ --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Server Test Setup
The existing test setup (`src/test/setup.ts`) imports `@testing-library/jest-dom` which is browser-specific. Server tests should NOT use this setup file. Server tests need their own environment configuration.

A separate vitest workspace or inline config override is needed for server tests to use `environment: 'node'` instead of `environment: 'jsdom'`.

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01a | Express server starts and listens on configured port | integration | `npx vitest run server/__tests__/server.test.ts -x` | No -- Wave 0 |
| INFRA-01b | GET /api/flights returns normalized MapEntity[] with flight type | unit | `npx vitest run server/__tests__/adapters/opensky.test.ts -x` | No -- Wave 0 |
| INFRA-01c | GET /api/ships returns normalized MapEntity[] with ship type | unit | `npx vitest run server/__tests__/adapters/aisstream.test.ts -x` | No -- Wave 0 |
| INFRA-01d | GET /api/events returns normalized MapEntity[] with event types | unit | `npx vitest run server/__tests__/adapters/acled.test.ts -x` | No -- Wave 0 |
| INFRA-01e | API keys are NOT exposed in any response body | unit | `npx vitest run server/__tests__/security.test.ts -x` | No -- Wave 0 |
| INFRA-01f | CORS headers allow frontend origin | integration | `npx vitest run server/__tests__/cors.test.ts -x` | No -- Wave 0 |
| INFRA-01g | Stale cache served when upstream is down | unit | `npx vitest run server/__tests__/cache.test.ts -x` | No -- Wave 0 |
| INFRA-01h | MapEntity types match discriminated union contract | unit | `npx vitest run server/__tests__/types.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run server/ --reporter=verbose`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/__tests__/` directory -- all test files listed above
- [ ] Vitest config for server tests needs `environment: 'node'` (not jsdom)
- [ ] Test utilities for mocking `fetch()` and `WebSocket` (native APIs)
- [ ] Consider `vitest.workspace.ts` or inline `test` config in server tests to separate server/client test environments

## Open Questions

1. **OpenSky OAuth2 client setup flow**
   - What we know: OAuth2 client credentials flow is required since March 18, 2026. Token endpoint is documented.
   - What's unclear: The exact steps to create an OAuth2 client in the OpenSky dashboard (vs. just registering an account). Documentation refers to creating "a new API client" but the UI may differ.
   - Recommendation: User must register at opensky-network.org and create OAuth2 client credentials manually before implementation. Document this in `.env.example`.

2. **OpenSky rate limit feasibility at 5s refresh**
   - What we know: 4000-8000 credits/day, 1-4 credits per bbox request. At 10s polling with a 3-credit bbox = ~25,920 credits/day -- exceeds the limit.
   - What's unclear: Whether the free authenticated tier can sustain anywhere near 5s refresh.
   - Recommendation: Default to 15-second polling interval (5,760 credits/day with 3-credit bbox = feasible). Allow configurable interval via env var. Document that 5s refresh requires an active ADS-B contributor account (8000 credits).

3. **ACLED event type mapping to missile/drone**
   - What we know: ACLED has event types like "Battles", "Explosions/Remote violence", "Violence against civilians". The MapEntity type wants `missile` and `drone`.
   - What's unclear: Exact mapping from ACLED event_type/sub_event_type to our entity types.
   - Recommendation: Use sub_event_type for finer discrimination. "Shelling/artillery/missile attack" maps to `missile`. "Air/drone strike" maps to `drone`. Other conflict events can default to a reasonable type or be filtered out. This mapping should be configurable.

## Sources

### Primary (HIGH confidence)
- [OpenSky REST API docs](https://openskynetwork.github.io/opensky-api/rest.html) - Endpoints, response format, auth, rate limits
- [AISStream.io documentation](https://aisstream.io/documentation) - WebSocket URL, subscription format, message types
- [ACLED API endpoint docs](https://acleddata.com/api-documentation/acled-endpoint) - Query params, response fields
- [Express 5.1 release announcement](https://expressjs.com/2025/03/31/v5-1-latest-release.html) - Express 5 now default on npm
- [Express error handling docs](https://expressjs.com/en/guide/error-handling.html) - Native async error catching
- [Node.js WebSocket docs](https://nodejs.org/en/learn/getting-started/websocket) - Native WebSocket client stable in v22.4+
- [tsx official docs](https://tsx.is/) - Watch mode, env-file flag support

### Secondary (MEDIUM confidence)
- [ReactSquad Express 5 setup guide](https://www.reactsquad.io/blog/how-to-set-up-express-5-in-2025) - TypeScript patterns, project structure
- [cors npm package](https://www.npmjs.com/package/cors) - Configuration options
- [concurrently npm package](https://www.npmjs.com/package/concurrently) - Script patterns
- [GitHub country bounding boxes](https://gist.github.com/graydon/11198540) - Iran coordinates

### Tertiary (LOW confidence)
- ACLED rate limits: Not documented; assumed reasonable polling (5 min) is safe
- OpenSky dashboard OAuth2 client creation: Exact UI steps not verified against current dashboard

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Express 5, cors, tsx, concurrently are all stable, well-documented
- Architecture: HIGH - Adapter pattern, discriminated unions, cache-with-staleness are standard patterns
- Upstream APIs: HIGH for OpenSky (official docs verified), HIGH for AISStream (official docs verified), MEDIUM for ACLED (some details required fetching multiple pages)
- Pitfalls: HIGH - OpenSky auth deprecation is critical and date-specific; other pitfalls verified from docs

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (30 days -- stable domain, but monitor OpenSky OAuth2 migration issues)
