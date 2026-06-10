# Phase 43: Ghost Link Prune Correctness - Pattern Map

**Mapped:** 2026-06-09
**Files analyzed:** 8 (all modified, zero new — server-only in-place extension)
**Analogs found:** 8 / 8 (every change is a self-analog extension of an existing surface)

> **Key framing:** This is NOT a new-file phase. Every file under change already exists and already contains the exact pattern being extended one section over. The "analog" for almost every change is the adjacent code in the same file. Per-file excerpts below are the precise lines to copy the shape from.

## File Classification

| Modified File                                                     | Role                            | Data Flow                                                               | Closest Analog                                                                | Match Quality |
| ----------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------- |
| `server/lib/urlLiveness.ts`                                       | service (probe/sweep/prune lib) | request-response (outbound HTTP) + batch (sweep) + transform (classify) | self — existing `probeUrl`/`persistLiveness`/`fetchOnce`/`pruneDeadUrlEvents` | exact         |
| `server/routes/operator-status.ts`                                | route (read-side aggregator)    | request-response                                                        | self — existing `DeadUrlSampleEntry` + `buildDeadUrlSample`                   | exact         |
| `server/__tests__/lib/urlLiveness.schema.test.ts`                 | test                            | transform (Zod round-trip)                                              | self — existing `validEntry()` + TTL-pin blocks                               | exact         |
| `server/__tests__/lib/urlLiveness.probe.test.ts`                  | test                            | request-response (fetch mock)                                           | self — existing probeUrl taxonomy table + Range assert                        | exact         |
| `server/__tests__/lib/urlLiveness.sweep.test.ts`                  | test                            | batch + transform                                                       | self — existing `__test__.persistLiveness` attemptCount cases                 | exact         |
| `server/__tests__/lib/urlLiveness.cronPrune.test.ts`              | test                            | batch                                                                   | self — existing `LIVENESS_BY_ID` fixture + trigger cases                      | exact         |
| `src/__tests__/lib/urlLiveness.schema.test.ts`                    | test (literal-path shim)        | transform                                                               | self — existing inline `validEntry` literal + TTL bounds                      | exact         |
| `docs/architecture/redis-keys.md` + `CLAUDE.md` §Serverless Cache | config/docs (contract registry) | n/a                                                                     | self — existing `events:url-liveness:{eventId}` registry line                 | exact         |

---

## Pattern Assignments

### `server/lib/urlLiveness.ts` (service, request-response + batch + transform)

This is the single substantive code file. Five distinct in-file analogs map to the five GHOST changes.

#### Analog A — Status enum + `.strict()` schema widening (GHOST-04/06/07/10)

**Source:** `server/lib/urlLiveness.ts:87-118`

Current 5-status enum + strict schema:

```typescript
export const UrlLivenessStatusSchema = z.enum(['live', '404', '403', 'dead-host', 'unknown']);
// ...
export const UrlLivenessSchema = z
  .object({
    status: UrlLivenessStatusSchema,
    lastProbedAt: z.string().datetime(),
    attemptCount: z.number().int().nonnegative(),
    lastUrlProbed: z.string().url(), // → becomes .nullable() (D-07)
    lastHttpStatus: z.number().int().nullable(),
  })
  .strict();
```

**Apply (D-04/D-07/D-16):** add `'soft-404'`, `'no-url'` to the enum; make `lastUrlProbed` → `z.string().url().nullable()`; add `evidence: z.string().max(200).nullable()`. Update the JSDoc at `:100-111` (attemptCount semantics block) in lockstep with D-10.

#### Analog B — Tiered TTL map (GHOST-04)

**Source:** `server/lib/urlLiveness.ts:137-152`

```typescript
const TTL_SEC_BY_STATUS: Record<UrlLivenessStatus, number> = {
  live: 7 * 24 * 3600,
  '404': 24 * 3600,
  '403': 24 * 3600,
  'dead-host': 24 * 3600,
  unknown: 3600,
};
export function ttlSecForStatus(status: UrlLivenessStatus): number {
  return TTL_SEC_BY_STATUS[status];
}
```

**Apply (D-04/D-09):** add `'soft-404': 24 * 3600` and `'no-url': 24 * 3600`. The `Record<UrlLivenessStatus, number>` type forces both entries at compile time — TS errors until added.

#### Analog C — `isTerminalDead` shared predicate (GHOST-06/07/09 anti-pattern boundary)

**Source:** `server/lib/urlLiveness.ts:442-444`

```typescript
export function isTerminalDead(status: UrlLivenessStatus): boolean {
  return status === '404' || status === '403' || status === 'dead-host';
}
```

**Apply (D-04/D-08/D-15):** add `status === 'soft-404'` (terminal-dead). Do NOT add `'no-url'` (D-08 — not terminal-dead). Do NOT remove `'403'` here — the GHOST-09 cron-only 403 exclusion is a prune-filter-local check, NOT an `isTerminalDead` change (RESEARCH anti-pattern; this predicate is shared by sidecar count `:528`, prune `:814`, and dashboard sample at `operator-status.ts:237`).

#### Analog D — Capped GET via `fetchOnce` (GHOST-06 body heuristic)

**Source:** `server/lib/urlLiveness.ts:245-262` (the existing 1 KiB Range-capped GET)

```typescript
async function fetchOnce(url: string, method: 'HEAD' | 'GET'): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'User-Agent': PROBE_UA };
    if (method === 'GET') headers.Range = 'bytes=0-1023'; // → generalize to 16 KiB cap
    return await fetch(url, { method, headers, redirect: 'manual', signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

**Apply (D-01/D-02):** add a 16 KiB (`bytes=0-16383`) body read on the 200 branch of `probeUrl` (`:318`), with a manual `Response.body.getReader()` abort at the cap for servers ignoring `Range` (RESEARCH Pattern 2). Feed the decoded head into a new pure exported helper `classifySoft404(bodyText, finalUrl, originalUrl)` (RESEARCH Pattern 1) — `probeUrl` already threads `finalUrl` per hop (`:319,343`) so redirect-to-home needs no new plumbing. Reuse hard-coded module constants for the cap and `NEAR_EMPTY_FLOOR_BYTES` (D-20 — no env surfaces, follow the `PROBE_CONCURRENCY` etc. constant block at `:175-180`). Body-read throw → degrade-open to `live`/null (D-03/D-22).

#### Analog E — `persistLiveness` attemptCount + sidecar (GHOST-08) + evidence (GHOST-10)

**Source:** `server/lib/urlLiveness.ts:493-541`

```typescript
const nextDead = isTerminalDead(probeResult.status);
const priorDead = prior !== null && isTerminalDead(prior.status);
let attemptCount: number;
if (!nextDead) {
  attemptCount = 0; // OLD: live OR unknown both reset
} else if (priorDead) {
  attemptCount = prior.attemptCount + 1;
} else {
  attemptCount = 1;
}
// ... build `next: UrlLiveness`, UrlLivenessSchema.parse(next), cacheSetSafe ...
// sidecar:
if (!priorDead && nextDead) {
  await redis.incr(URL_LIVENESS_COUNT_KEY);
} else if (priorDead && !nextDead) {
  const after = await redis.decr(URL_LIVENESS_COUNT_KEY);
  if (typeof after === 'number' && after < 0) await redis.set(URL_LIVENESS_COUNT_KEY, 0);
}
```

**Apply (D-10):** split the `!nextDead` branch — `'live'` → 0, `'unknown'` → `prior?.attemptCount ?? 0` (PRESERVE), `'no-url'` → 0. **Keep the sidecar DECR firing on dead→unknown** (event exits dead-membership) while preserving attemptCount — independent axes (RESEARCH Pitfall 4 / Open Q 1). Add `evidence` to the `next` object (writer always sets it, D-17). The existing `UrlLivenessSchema.parse(next)` at `:519` is the writer-only runtime parse — old stored entries are never re-validated (RESEARCH "writer-only Zod-parse CONFIRMED").

#### Analog F — `buildProbeCandidates` source-skip → explicit `no-url` (GHOST-07)

**Source:** `server/lib/urlLiveness.ts:599-604`

```typescript
for (const entity of entities) {
  const url = entity?.data?.source;
  if (!url || typeof url !== 'string' || url.length === 0) {
    continue; // OLD: silent drop
  }
  // ...
}
```

**Apply (D-06/D-09):** replace the silent `continue` with a side-effecting `no-url` write (call `persistLiveness` or a thin no-fetch variant once per tick), and return a `classifiedNoUrl` count alongside the candidate array for the cron log line. RESEARCH Open Q 3 recommends the side-effect inside `buildProbeCandidates` (it already reads every event and has `persistLiveness` in-module).

#### Analog G — Cron-only 403 exclusion in prune filter (GHOST-09)

**Source:** `server/lib/urlLiveness.ts:813-817`

```typescript
if (!isTerminalDead(entry.status)) continue;
if (opts.trigger === 'cron' && entry.attemptCount < 3) continue; // existing D-12 gate
```

**Apply (D-15, if demoted per evidence):** insert one line between them — `if (opts.trigger === 'cron' && entry.status === '403') continue;`. The `opts.trigger` discriminator already exists (`:775`); manual prune keeps no gate. Evidence-gated (D-14): pre-register demotion, confirm with the D-13 browser-UA re-probe sample before committing.

---

### `server/routes/operator-status.ts` (route, request-response)

**Analog:** self — `DeadUrlSampleEntry` + `buildDeadUrlSample` (`:185-259`)

**Type widening (D-19):**

```typescript
type DeadUrlSampleEntry = {
  eventId: string;
  url: string;
  status: 'dead-host' | '403' | '404'; // → add 'soft-404' (NOT 'no-url' — sample is terminal-dead only)
  // → add: evidence: string | null;
};
```

**Apply:** add `'soft-404'` to the status union; add `evidence: string | null`; source `evidence` from `value.evidence` at the `sample.push` (`:241-247`); widen the cast at `:246`. This is read-side only — `cacheGetSafe<UrlLiveness>` at `:234` is a TS generic cast, no runtime Zod parse, so old entries without `evidence` read as `undefined`/`null` safely. No client UI work this phase.

---

### Test lockstep files (test, transform/batch)

#### `server/__tests__/lib/urlLiveness.schema.test.ts`

**Analog:** self — `validEntry()` factory (`:31-40`) + the enum-loop (`:81-85`) + TTL pins (`:88-119`)

**Apply (Pitfall 5):**

- Add `evidence: null` to `validEntry()` (else `.strict()` rejects every fixture).
- Extend the enum loop `['live','404','403','dead-host','unknown']` → add `'soft-404'`, `'no-url'`.
- Add positive cases: parse a `no-url` entry with `lastUrlProbed: null`; parse an entry with a string `evidence`.
- Add TTL pins: `expect(ttlSecForStatus('soft-404')).toBe(24*3600)` + `'no-url'` 24h, in both the `≤` upper-bound block and the exact-ceiling block (`:114-118`).

#### `src/__tests__/lib/urlLiveness.schema.test.ts` (literal-path shim — Pitfall 6)

**Analog:** self — inline `validEntry`-shape literals (`:36-56`) + TTL bound assertions

**Apply:** mirror every schema pin — add `evidence` to inline literals, add `soft-404`/`no-url` TTL bound assertions. The shim is intentionally minimal (1 round-trip + 1 strict rejection + TTL bounds); keep it minimal but current.

#### `server/__tests__/lib/urlLiveness.sweep.test.ts`

**Analog:** self — `__test__.persistLiveness` cases (`:202-247`)

**Apply (GHOST-08 / Pitfall 4):** the existing `'dead→unknown resets attemptCount to 0 and fires DECR'` test (`:226`) **will fail and must flip** — assert `attemptCount` PRESERVED (e.g. stays 3) AND DECR still fires once. Keep `'dead→live resets attemptCount to 0'` (`:202`) unchanged. Add: a `dead→unknown→dead` accumulation case crossing `>=3`; a `buildProbeCandidates` source-less → `no-url` write case (no fetch); add `evidence` to all `cacheHit({...})` literals.

#### `server/__tests__/lib/urlLiveness.cronPrune.test.ts`

**Analog:** self — `LIVENESS_BY_ID` fixture (`:90-135`) + trigger cases

**Apply (GHOST-08/09):** add `evidence` to every fixture (A–E). Existing E is `403/ac=4` — add a case asserting cron SKIPS E (403) but manual PRUNES E. Add an explicit `unknown`-excluded-on-both-triggers pin (D-11 — so a future status addition can't silently widen prune). Keep the `attemptCount >= 3` cron-gate cases verbatim (D-12).

---

## Shared Patterns

### Degrade-open Redis sidecar maintenance

**Source:** `server/lib/urlLiveness.ts:527-540` (INCR/DECR + floor-at-0) and `:851-859` (DECRBY)
**Apply to:** all new sidecar touches (soft-404 joins via `isTerminalDead`; no new bookkeeping). Wrap raw `redis.incr/decr` in try/catch + `log.warn`; floor underflow via the lone permitted `redis.set(KEY, 0)`.

```typescript
try { /* incr/decr */ } catch (err) { log.warn({ err, ... }, '... (degrade-open)'); }
```

### `.strict()` Zod schema + paired schema-test + shim lockstep (Phase 32 D-22)

**Source:** `server/lib/urlLiveness.ts:96-116` + `server/__tests__/lib/urlLiveness.schema.test.ts` + `src/__tests__/lib/urlLiveness.schema.test.ts`
**Apply to:** any enum/field addition — fails `vitest run` until all three update in the same commit.

### NODE_ENV-gated `__test__` export

**Source:** `server/lib/urlLiveness.ts:897-900`

```typescript
export const __test__ =
  process.env.NODE_ENV === 'test'
    ? { waitForHostSlot, pruneStaleHostSlots, hostNext, persistLiveness }
    : undefined;
```

**Apply to:** if `classifySoft404` is extracted as pure, export it directly (pure, no fetch — testable without the `__test__` gate); the gate is only for module-private helpers like `persistLiveness`.

### Trigger-discriminated prune filter

**Source:** `server/lib/urlLiveness.ts:774-817` (`opts.trigger: 'manual' | 'cron'`)
**Apply to:** the GHOST-09 cron-only 403 exclusion — a one-line `trigger === 'cron'` filter, never an `isTerminalDead` change.

### Hard-coded module constants (no env surfaces — D-20)

**Source:** `server/lib/urlLiveness.ts:175-180` (`PROBE_CONCURRENCY`, `PROBE_TIMEOUT_MS`, ...)
**Apply to:** new heuristic knobs — 16 KiB cap, `NEAR_EMPTY_FLOOR_BYTES` (~512), `NOT_FOUND_MARKERS` list. Module-level `const`, not env.

### Contract registry lockstep (CLAUDE.md + redis-keys.md)

**Source:** CLAUDE.md §Serverless Cache `events:url-liveness:{eventId}` line + `docs/architecture/redis-keys.md`
**Apply to:** document new statuses (`soft-404`, `no-url`), the `evidence` field, the nullable `lastUrlProbed`, and the new attemptCount semantics. NOTE (RESEARCH A6 VERIFIED): `src/__tests__/lib/redis-registry.test.ts` pins only the key NAME, not value shape — no change needed there.

---

## No Analog Found

None. Every change extends an existing in-file surface. The only genuinely new code unit is the pure `classifySoft404` helper, whose shape is given verbatim in RESEARCH Pattern 1 (lines 130-159) and whose evidence-string formats are pinned by CONTEXT D-16.

| Item                                       | Role    | Data Flow        | Reason                                                                                                                                                                                  |
| ------------------------------------------ | ------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/sample-pruned-urls.ts` (optional) | utility | request-response | Claude's discretion (D-13/D-14 evidence sample); checked-in only if reuse expected, else documented one-off. Closest pattern: existing `scripts/snapshot-v3-redis.ts` SCAN+fetch shape. |

## Metadata

**Analog search scope:** `server/lib/urlLiveness.ts` (full), `server/routes/operator-status.ts` (170-265), 4 `server/__tests__/lib/urlLiveness.*.test.ts`, `src/__tests__/lib/urlLiveness.schema.test.ts`
**Files scanned:** 6 read in full/targeted; CONTEXT + RESEARCH supplied exact line numbers
**Pattern extraction date:** 2026-06-09
