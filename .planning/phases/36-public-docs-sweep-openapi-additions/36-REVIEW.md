---
phase: 36-public-docs-sweep-openapi-additions
reviewed: 2026-05-29T00:00:00Z
depth: quick
files_reviewed: 13
files_reviewed_list:
  - README.md
  - docs/adr/0011-v3-llm-pipeline-architecture.md
  - docs/architecture/README.md
  - docs/architecture/data-flows.md
  - docs/architecture/deployment.md
  - docs/architecture/ontology/algorithms.md
  - docs/architecture/ontology/types.md
  - docs/architecture/system-context.md
  - docs/degradation.md
  - docs/runbook.md
  - server/openapi.yaml
  - server/__tests__/openapi/openapi-lint.test.ts
  - redocly.yaml
findings:
  critical: 1
  warning: 9
  info: 5
  total: 15
status: issues_found
---

# Phase 36: Code Review Report

**Reviewed:** 2026-05-29
**Depth:** quick
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Phase 36 is a documentation + OpenAPI sweep with one new vitest gate
(`server/__tests__/openapi/openapi-lint.test.ts`). The mechanical gates pass
(vitest 2380/2380, redocly lint exit 0, markdown-link-check) — but the OpenAPI
spec contains substantive drift that the lint gate cannot detect. The drift gate,
redocly config, and most prose are sound; the OpenAPI YAML itself ships at least
one BLOCKER and several WARNINGs that contradict the canonical server types and
runtime Zod schemas the spec is supposed to mirror.

The most consequential finding is **CR-01**: `ConflictEventEntity.type` in
`server/openapi.yaml` enumerates 11 pre-Phase-27 CAMEO values, but the
canonical `server/types.ts` and the live `server/schemas/cacheResponse.ts` Zod
schema used by `sendValidated` on `/api/events` both define exactly 5
(`airstrike | on_ground | explosion | targeted | other`). The whole stated
point of Phase 36 was bringing public docs into v1.5 reality; this is the one
place that miss matters most because the spec is now actively _wrong_ about a
contract that has a runtime validator.

Redocly config (`redocly.yaml`) is conservatively scoped — the four downgraded
rules (`operation-operationId`, `operation-4xx-response`,
`no-server-example.com`, `security-defined`) are genuine style rules, not
drift-relevant rules. The shell-out vitest gate
(`server/__tests__/openapi/openapi-lint.test.ts`) is well-formed: explicit
node environment, 30s outer timeout / 25s inner spawn timeout, stdout+stderr
surfaced on failure (only on failure, gating is correct). No security issues
in the docs themselves.

## Critical Issues

### CR-01: OpenAPI `ConflictEventEntity.type` enum is stale — 11 pre-Phase-27 values vs canonical 5

**File:** `server/openapi.yaml:1236-1247`
**Severity:** BLOCKER

**Issue:** The `ConflictEventEntity.type` enum in
`components/schemas/ConflictEventEntity` lists the pre-Phase-27 11-member
CAMEO-derived union:

```yaml
type:
  type: string
  enum:
    - airstrike
    - ground_combat
    - shelling
    - bombing
    - assassination
    - abduction
    - assault
    - blockade
    - ceasefire_violation
    - mass_violence
    - wmd
```

Canonical sources all ship the 5-member taxonomy:

- `server/types.ts:12` —
  `export type ConflictEventType = 'airstrike' | 'on_ground' | 'explosion' | 'targeted' | 'other'`.
- `server/schemas/cacheResponse.ts:62` —
  `type: z.enum(['airstrike', 'on_ground', 'explosion', 'targeted', 'other'])`.
  This Zod schema is the runtime validator used by
  `sendValidated(res, eventsResponseSchema, …)` in `server/routes/events.ts:300`.
- `docs/architecture/ontology/types.md:119` (in this phase's scope) — also
  documents the 5-type union and the Phase 27 narrowing rationale.

Consumers reading the spec will write clients that handle the wrong
vocabulary; `/api/events` only emits the 5 new values (and would trip the
dev-mode `RESPONSE_SCHEMA_MISMATCH` if it ever emitted the old ones). The
phase's stated goal — bringing the public OpenAPI spec into v1.5 reality —
leaves this drift in place. The Redocly lint gate cannot catch this (the enum
is structurally valid YAML); a runtime cross-validation against the Zod
schema would, but no such gate exists.

**Fix:**

```yaml
ConflictEventEntity:
  type: object
  required: [id, type, lat, lng, timestamp, label, data]
  properties:
    id:
      type: string
    type:
      type: string
      enum:
        - airstrike
        - on_ground
        - explosion
        - targeted
        - other
```

Consider a follow-up cross-check (next API-hardening phase) that asserts
`server/schemas/cacheResponse.ts` Zod enums match the OpenAPI enum values for
at least the `type` discriminator, `WaterFacilityType`, and `SiteType` —
the structural lint gate alone is not sufficient.

## Warnings

### WR-01: `/api/cron/refresh-events` 200 response schema documents a non-existent `status: 'ran' | 'skipped'` field

**File:** `server/openapi.yaml:931-954`
**Severity:** WARNING

**Issue:** The spec documents the 200 response as:

```yaml
properties:
  ok:
    type: boolean
    enum: [true]
  durationMs:
    type: integer
    minimum: 0
  status:
    type: string
    description: |
      `'ran'` on extraction dispatch, `'skipped'` on
      cooldown-active skip, or other status values surfaced
      by `runRefreshExtraction`.
```

The handler at `server/routes/refresh-events-cron.ts:75` returns
`res.status(200).json({ ok: true, durationMs, ...result })`. The `result` is
a `RunRefreshResult` (`server/lib/llmExtractionPipeline.ts:187-196`) with
fields `{dispatched: boolean, reason?: 'cooldown'|'llm_unconfigured'|'no_raw_events'|'pipeline_busy', coldCacheBypass?: boolean, schemaVersion?: 'v3'}`.
There is no `status` field anywhere in the code path — every return site uses
`dispatched` + (optional) `reason`. A consumer following the spec will branch
on `status` and silently mishandle every response.

Compounding this, `docs/architecture/data-flows.md:205` shows a fictional
`{skipped: "cooldown"}` return shape in the mermaid diagram — neither the
field name nor the value match the actual return.

**Fix:** Document the actual handler shape:

```yaml
properties:
  ok:
    type: boolean
    enum: [true]
  durationMs:
    type: integer
    minimum: 0
  dispatched:
    type: boolean
    description: True when a fresh extraction was kicked off.
  reason:
    type: string
    enum: [cooldown, llm_unconfigured, no_raw_events, pipeline_busy]
    description: Populated when dispatched=false.
  coldCacheBypass:
    type: boolean
  schemaVersion:
    type: string
    enum: [v3]
```

Also update the mermaid block in `data-flows.md:205` to
`{dispatched: false, reason: "cooldown"}` instead of `{skipped: "cooldown"}`.

### WR-02: `LlmReplayDiff.old` inherits CR-01's stale enum; `LlmReplayDiff.new` is over-loose

**File:** `server/openapi.yaml:1826-1848`
**Severity:** WARNING

**Issue:** `LlmReplayDiff.old` is declared as
`$ref: '#/components/schemas/ConflictEventEntity'`, which inherits CR-01's
stale 11-type enum. So even if CR-01 is fixed at the `ConflictEventEntity`
definition site, this consumer is silently corrected — but until CR-01 lands,
the replay diff schema is doubly wrong: wrong `type` enum at both the `old`
slot and (different problem) the `new` slot, which declares
`type: object, nullable: true` so it dodges the enum but loses the contract
entirely.

**Fix:** Apply CR-01's enum fix at the `ConflictEventEntity` site. Consider
tightening `LlmReplayDiff.new`:

```yaml
new:
  nullable: true
  allOf:
    - $ref: '#/components/schemas/ConflictEventEntity'
  description: |
    Recomputed enrichment for the same groupKey, without persisting. May be
    null if processEventGroupsV3 produced no event for this group.
```

So the diff target is documented rather than typed as "any object."

### WR-03: `/api/events/llm-replay/{groupKey}` 404 envelope is missing `required: [error]`

**File:** `server/openapi.yaml:770-783`
**Severity:** WARNING

**Issue:** The 404 schema declares `error` as an enum but never marks it
`required`. The handler at `server/routes/events.ts:475, :480, :483` always
emits exactly `{error: '<one-of-three>'}` so the field is in fact required;
declaring it optional invites consumers to write defensive handling for an
envelope shape that never occurs. Compare with the canonical `ErrorResponse`
schema (lines 1087-1112) which correctly declares
`required: [error, code, statusCode]`.

The inline 404 envelope also deviates from the canonical `ErrorResponse`
shape (no `code`, no `statusCode`, no `requestId`). This is intentional per
the prose, but it means operator clients have to special-case this route. A
reviewer should be aware before consolidating with `$ref: 'ErrorResponse'`.

**Fix:** Add `required: [error]` to the inline 404 schema. Decide whether to
standardize on `ErrorResponse` envelope or keep the lean shape; if you keep
it lean, state so explicitly in the description.

### WR-04: `operator:audit-log` cap (500) is documented in 5 places but enforced in only 1

**File:** `server/openapi.yaml:733-734`, cross-ref `CLAUDE.md` registry +
`docs/runbook.md:959`
**Severity:** WARNING

**Issue:** The 500-entry SADD cap on `operator:audit-log` is restated in the
OpenAPI prose, CLAUDE.md, the runbook, and (per Phase 28.2 W3) the writer
helper. The actual writer enforcement lives in `server/lib/operatorAudit.ts`
(not in scope of this review, but referenced). The route handler at
`server/routes/operator-status.ts:285` reads SMEMBERS without verifying the
cap. If the writer's actual cap silently drifts, no doc-gate notices.

**Fix:** Out of Phase 36 strict scope, but worth tracking: export
`OPERATOR_AUDIT_LOG_CAP = 500` from `server/lib/operatorAudit.ts` and
reference it from `src/__tests__/lib/redis-registry.test.ts` (Phase 35 D-01
pattern) so the cap is single-sourced.

### WR-05: README claims "1277 passing tests" but current suite is 2380/2380

**File:** `README.md:34, :40, :151, :300, :479`
**Severity:** WARNING

**Issue:** The README repeatedly cites "1277 passing tests across 101 files"
(badge, copy, test-suite table, Quick Start, Testing section). The Phase 36
context says the vitest suite is 2380/2380. If those 2380 are real, the
README is ~1100 tests behind reality, which is a significant misrepresentation
in the portfolio-facing intro. If the README's 1277 is the v1.4 baseline that
was deliberately frozen, that policy should be stated explicitly; otherwise
it should be refreshed.

Phase 36 explicitly touched README.md (per the phase plan), so updating this
count was in scope. A hiring-manager reader will catch the discrepancy
against the rest of the engineering-rigor framing.

**Fix:** Run `npx vitest run` to get the current count. Update README.md:34
(badge URL), :40, :151, :300, :479 to the current number. Or add a one-line
note that 1277 is the v1.4 baseline preserved for changelog continuity.

### WR-06: `docs/runbook.md` §10 references deleted `events:llm:v2` keys as live diagnosis

**File:** `docs/runbook.md:577-617` (§10 "LLM pipeline hung / `/api/events` returning 500")
**Severity:** WARNING

**Issue:** §10 instructs operators to `curl … /get/events:llm:v2` and
`/get/events:llm:v2:partial`, and to `del/events:llm:v2`. Per ADR-0010 and
ADR-0011 (both in scope), the v2 extractor and its Redis keys were deleted
in Phase 29; the terminal cache is `events:llm:v3` and the partial-progress
key was retired in Phase 35 SIMPLIFY-02.

The section is labeled "Phase 27.4.1 era" at the top, but the diagnosis
commands embedded inside are presented as live runbook commands. An on-call
operator following this section after a real incident would issue Redis
commands against keys that don't exist, then conclude the cache is "clean"
when in fact they checked the wrong cache.

Compounded: the `LLM_BATCH_TIMEOUT_MS` default in the same section is stated
as `90000ms (90s) hard-kill with 60s soft-warn`, which `data-flows.md` (in
scope) explicitly retired in Phase 30 SIMPLIFY-03 — the soft-warn tier no
longer exists, and the default is `120000ms`.

**Fix:** Either (a) rewrite §10 against the v3 keys (`events:llm:v3`
terminal, no partial), or (b) add a bold leading callout: "HISTORICAL —
Phase 27.4.1 era. v2 deleted Phase 29; use §13 NIM throttle handling + §15
force-trigger for the v3 path." Update the `LLM_BATCH_TIMEOUT_MS` default to
`120000ms` (Phase 30 SIMPLIFY-03) and remove the soft-warn reference.

### WR-07: `docs/degradation.md` says rate limit is 6 req/min; README + CLAUDE.md + reality say 60 req/min (Phase 28.1)

**File:** `docs/degradation.md:233-244`
**Severity:** WARNING

**Issue:** §"Rate Limit Layer" of `degradation.md` says:

> `rateLimiters.public` baseline tier at **6 req/min** per IP, prefixed
> `ratelimit:public`, applied to every `/api/*` request.

But README §"Live demo rate limit hardening" (lines 369-381) explicitly
documents the raise to 60 req/min in Phase 28.1:

> Was 6/min at Phase 26.4-04 land; raised to 60/min in Phase 28.1 after the
> dashboard's own ~9-hook cold-start burst … was tripping the cap.

CLAUDE.md `Rate limiting` section also says 60 req/min. So `degradation.md`
documents a pre-Phase-28.1 limit that's been wrong for ~7 phases. Operators
reading `degradation.md` will under-estimate scraper-tolerance by 10×.

**Fix:** Update `docs/degradation.md:236-237` from "6 req/min" to
"60 req/min (Phase 28.1)" and add the Bearer-bypass note from CLAUDE.md so
the cross-doc story is consistent. The same "6 req/min" figure appears at
`docs/runbook.md:411` and `:446` — fix those too.

### WR-08: README architecture diagram implies uniform CDN layer; operator + cron + health surfaces are `no-store`

**File:** `README.md:200-223`
**Severity:** WARNING

**Issue:** The ASCII data-flow diagram in the README shows every `/api/*`
request hitting Vercel Edge with `s-maxage per endpoint` as the first layer.
That's true for the 8 data routes (flights/ships/events/news/sites/markets/
weather/water/geocode), but the `cacheControl(0, 0)` middleware applied at
`server/index.ts:129, :136, :143` to dashboard / operator-status /
audit-status routes means these surfaces explicitly skip CDN caching, and
`/health` + `/api/cron/*` per `deployment.md:110-111` are `no-store`. The
README diagram implies a uniform CDN layer that doesn't exist for the
operator + cron surfaces — a minor but consequential simplification given
how prominently the diagram frames the architecture.

**Fix:** Either (a) add a note under the diagram clarifying that operator +
cron + health endpoints bypass the CDN layer, or (b) annotate the diagram
itself ("data routes" arrow rather than every `/api/*`). Low-priority
correctness nit.

### WR-09: `/api/audit-status` schema declares strict `pass | fail` enum; route emits whatever the GH Actions workflow wrote without validation

**File:** `server/openapi.yaml:580-588` vs `server/routes/audit-status.ts:64-119`
**Severity:** WARNING

**Issue:** The spec asserts each entry of `endpoints` is a string from
`{pass, fail}`. The handler at `audit-status.ts:64-116` reads the JSON
payload from `audit:connectivity:last-result` as `AuditPayload` typed loosely
(`endpoints?: Record<string, 'pass' | 'fail'>`) but **never validates the
incoming shape** — it just returns `parsed` via `res.json(parsed)`. The
shape contract lives entirely in the GitHub Actions workflow that writes
the key, not in the route. If that workflow ever writes `'green'` instead of
`'pass'`, the spec is silently violated and consumers parsing strictly will
throw.

The spec docstring acknowledges this loosely ("JSON shape pinned by W-3
contract test"), but the contract test is in a different scope. For the spec
to be a real public contract, either the route should `safeParse` the
payload before returning it (so workflow-side drift surfaces as
`{status: 'absent'}`), or the spec should describe the field as
`additionalProperties: type: string` without the enum, accepting that the
schema is upper-bound documentation only.

**Fix:** Apply Zod validation at the route boundary against an
`auditPayloadSchema`. If the parse fails, log + return `{status: 'absent'}`
(the existing degrade-open contract handles this case already). This brings
the public spec under runtime enforcement — matches the `sendValidated`
pattern used on data routes.

## Info

### IN-01: `redocly.yaml` rule downgrades are sound, with one residual risk

**File:** `redocly.yaml:30-34`

The four downgraded rules (`operation-operationId`, `operation-4xx-response`,
`no-server-example.com`, `security-defined`) are stylistic / scoping rules,
not drift-relevant. The YAML's downgrade rationale is correct: 14 endpoints
intentionally lack `operationId`, health endpoints intentionally have 2xx-only
declared responses (degrade-open), and public data endpoints are intentionally
unauthenticated by design.

Minor residual risk: `security-defined` downgraded to `warn` means if a
future operator-tier endpoint forgets its `security:` block, the spec will
lint-pass but the endpoint will appear publicly accessible in the OpenAPI
contract. The vitest gate won't catch this. All four currently-Bearer-gated
operator routes have explicit `security: [operatorBearer: []]` blocks, so
this is fine for now, but worth a follow-up phase to add a custom Redocly
rule requiring a `security:` block on `/api/operator-*` or `/api/events/llm-*`
path prefixes.

**Suggested follow-up:** track for a future API-hardening phase.

### IN-02: `openapi-lint.test.ts` uses `npx` — works but adds package-resolution latency

**File:** `server/__tests__/openapi/openapi-lint.test.ts:53`

The test shells out via
`spawnSync('npx', ['@redocly/cli', 'lint', SPEC, '--format=stylish'], …)`.
`npx` re-resolves the binary on every invocation; that's slower than calling
the resolved binary directly via `node_modules/.bin/redocly`. The 30s vitest
timeout absorbs this (standalone redocly is ~2s) but on cold caches the
variance is real.

**Suggested fix (optional):**

```ts
const REDOCLY_BIN = resolve(REPO_ROOT, 'node_modules/.bin/redocly');
const result = spawnSync(REDOCLY_BIN, ['lint', SPEC, '--format=stylish'], {
  cwd: REPO_ROOT,
  encoding: 'utf-8',
  timeout: 25_000,
});
```

Drops the npx hop. Current shape is correct, just slower.

### IN-03: `console.error` gating in the lint test is correct

**File:** `server/__tests__/openapi/openapi-lint.test.ts:58-66`

Re-read confirms the `console.error` calls are inside
`if (result.status !== 0)`, so they only print on failure. No noise on green
runs. Mentioned for the audit trail — no action.

### IN-04: ADR-0011 Phase 36 sub-block carries explicit append-date

**File:** `docs/adr/0011-v3-llm-pipeline-architecture.md:147`

ADR-0011's Phase 36 sub-block correctly carries an explicit append-date
(2026-05-29) and cross-references the canonical reliability doc. Matches the
ADR-0010 sub-block pattern. No action.

### IN-05: `docs/architecture/ontology/types.md` already documents the correct 5-type taxonomy

**File:** `docs/architecture/ontology/types.md:119, 131-137`

When fixing CR-01 in `server/openapi.yaml`, cross-reference `types.md` to
confirm the intended set rather than reverse-engineering it from the Zod
schema. The in-scope architecture doc already says:

```ts
type ConflictEventType = 'airstrike' | 'on_ground' | 'explosion' | 'targeted' | 'other';
```

And documents the Phase 27 narrowing rationale inline. The OpenAPI spec is
the outlier.

---

_Reviewed: 2026-05-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
