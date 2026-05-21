# Phase 33 Actor Metadata Audit Report — Stub

> **Status:** STUB. Committed alongside `audit/run-audit.ts` so downstream
> waves can reference the file path. Operator must run the audit against
> staging `events:llm:v3` cache, then overwrite this file with real counts
> (see [`33-VALIDATION.md`](33-VALIDATION.md) Manual-Only Verifications row 1).
>
> Why a stub now? Without committing the file path Plan 02 + Plan 05's
> downstream waves cannot reference it — but actually populating the
> per-bucket counts requires live Redis access against staging which is
> Manual UAT only (Plan 01 D-01 explicitly excludes the audit from
> `npm test` / CI).

**Captured:** TBD (overwritten by `run-audit.ts` on first execution)
**Cache tier:** TBD
**Total events scanned:** TBD

## Per-bucket counts

| Bucket                  | Description                                                                                                                                      | Count | % of total |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ---------- |
| (a) null/empty          | actors null, missing, or all-whitespace                                                                                                          | TBD   | TBD        |
| (b) raw CAMEO           | regex `/^[A-Z]{3,6}$/` ∩ committed CAMEO codebook                                                                                                | TBD   | TBD        |
| (c) ambiguous           | static deny-list (`soldiers`, `forces`, `militants`, `troops`, `fighters`, `the army`, `gunmen`, `attackers`, `rebels`, `insurgents`, `militia`) | TBD   | TBD        |
| (d) source-disagreement | NOT auto-detected — see spot-check section below                                                                                                 | —     | —          |

## Bucket (a) — null/empty actors

_TBD — populated by `run-audit.ts` against staging Redis._

## Bucket (b) — raw CAMEO actor codes

_TBD — populated by `run-audit.ts` against staging Redis. Requires `cameo-codes.json` from Plan 33-02; in degraded mode this section will be empty._

## Bucket (c) — ambiguous generic actors

_TBD — populated by `run-audit.ts` against staging Redis._

## Bucket (d) — source-disagreement (HUMAN SPOT-CHECK)

Reserved for operator review per D-02 final clause. After running the audit
the script seeds 10 random candidates from the a/b/c overlap; mark each
`[✓ disagrees]` (the extracted actors disagree with the source URL) or
`[✗ matches source]` (the extracted actors agree with the source URL) inline.

_TBD — populated by `run-audit.ts` against staging Redis._

## How to populate this report

1. Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` env vars to the
   staging tier credentials.
2. Set `CACHE_KEY_PREFIX` to match the tier you want to audit (empty for
   prod, `dev:` for dev). For production runs pass `--prod-confirm` as a
   defense-in-depth gate.
3. Run:
   ```sh
   node --import tsx/esm \
     .planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/audit/run-audit.ts \
     [--prod-confirm]
   ```
4. The script overwrites this file with real per-bucket counts + 5–10
   examples per bucket + 10 bucket-d spot-check seeds.
5. Operator reviews bucket-d candidates and annotates `[✓]`/`[✗]` inline.
6. Commit the populated report to the phase branch.

## Next actions (after population)

1. Operator commits this report alongside annotations. Plan 33-02 reads the
   bucket-a/b/c findings to seed `server/data/actor-catalog.ts`.
2. Plan 33-05's ground-truth backfill targets the ≥30 of 50 events
   identified here as needing `expectedActor1` / `expectedActor2`
   enrichment.
3. Plan 33-06's `/api/operator-status` lazy-compute uses the SAME
   `classifyEventActors` (Pitfall §1) so the dashboard counts mirror this
   committed report.
