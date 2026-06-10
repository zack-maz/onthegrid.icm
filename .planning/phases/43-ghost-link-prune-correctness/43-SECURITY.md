---
phase: 43
slug: ghost-link-prune-correctness
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-09
---

# Phase 43 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary                                                    | Description                                                                                                                                                            | Data Crossing                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| stored Redis entry → schema parse (writer-only)             | Old `events:url-liveness:{eventId}` entries lack `evidence`; only the writer `UrlLivenessSchema.parse()` runs at runtime — readers use TS-generic `cacheGetSafe` casts | Liveness records (low sensitivity) |
| outbound probe → external publisher/CDN                     | Fetched HTML body is UNTRUSTED external input; probe follows redirects across hosts                                                                                    | Untrusted HTML bodies              |
| redirect chain → SSRF guard                                 | Each hop and the final body GET must target only `isPrivateHost`-vetted URLs                                                                                           | URLs                               |
| stored prior entry → attemptCount derivation                | Writer reads prior entry via generic cast; absent prior defaults safely (`prior?.attemptCount ?? 0`)                                                                   | Attempt counters                   |
| event cache → candidate builder                             | `data.source` is pipeline-produced; source-less events explicitly classified `no-url`, never silently dropped                                                          | Event URLs                         |
| operator workstation → production Redis / Bearer aggregator | Sampler script reads `operator:audit-log` + `events:url-liveness:*` behind `DASHBOARD_PASSWORD` + Upstash creds                                                        | Credentials (env-only)             |
| script → live publisher URLs                                | Re-probing pruned + 403'd URLs is outbound HTTP to untrusted hosts                                                                                                     | URLs + HTTP statuses               |
| cron vs manual prune trigger                                | `opts.trigger` discriminates the destructive prune path; cron-only 403 exclusion lives ONLY in the prune filter, never in shared `isTerminalDead`                      | Prune decisions                    |
| stored entry → operator-status read                         | `buildDeadUrlSample` reads via TS-generic cast; old entries lacking `evidence` coerce to null                                                                          | Diagnostic strings                 |

---

## Threat Register

| Threat ID | Category                                 | Component                                                        | Disposition | Mitigation                                                                                                                                                                                                                 | Status |
| --------- | ---------------------------------------- | ---------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-43-01   | Tampering                                | Schema migration on live `events:url-liveness:{eventId}` entries | accept      | Writer-only Zod parse (`urlLiveness.ts:898`); readers use generic casts (`operator-status.ts:249`, `urlLiveness.ts:842`); all TTLs ≤7d so population turns over in a week (D-17)                                           | closed |
| T-43-02   | DoS                                      | `.strict()` schema drift vs test fixtures                        | mitigate    | Lockstep landed: `evidence: null` in every fixture; schema test + src shim pin soft-404/no-url/evidence/strict (33 pins); 5 suites / 112 tests green                                                                       | closed |
| T-43-03   | SSRF (Tampering/Info Disclosure)         | Capped GET on 200 branch of `probeUrl`                           | mitigate    | GET targets already-vetted `currentUrl`/`finalUrl` only (`urlLiveness.ts:552`); `isPrivateHost` at probe entry `:619` + every redirect hop `:690`; test "private host → unknown WITHOUT calling fetch" (probe test `:240`) | closed |
| T-43-04   | DoS (large body)                         | Publisher streams multi-MB body ignoring Range                   | mitigate    | `readCappedBody` breaks at `SOFT404_BODY_CAP_BYTES`=16384, `finally reader.cancel()` (`urlLiveness.ts:487-505`); cap-abort test (probe test `:544`); `Range: bytes=0-16383` asserted `:541`                                | closed |
| T-43-05   | Tampering (malicious body)               | Untrusted HTML influencing classification/evidence               | mitigate    | ASCII substring scan + tag-strip length only — no eval/parse/render (`classifySoft404` `:323-372`); evidence capped `z.string().max(200)` + writer `slice(0,200)`; Phase 44 TEXT-render note at `operator-status.ts:202`   | closed |
| T-43-06   | Repudiation/abuse (scanner/amplifier)    | Extra capped GET outbound traffic                                | mitigate    | Polite-citizen contract intact (D-21): `createLimit(8)`, per-host 1 req/s + 200ms jitter, 10s timeout, 3-hop cap, identifying UA (`:220-225`); follow-up GET calls `waitForHostSlot` (`:547`)                              | closed |
| T-43-07   | Precision risk                           | Soft-404 false positive on live SPA/section page                 | accept      | D-03 precision-first tie-break (`:370-371`); WR-04 no-`<script>` co-condition (`:364-366`); deep→shallow redirect-to-home requirement (`:343`); GHOST-09 empirical backstop in 43-VERIFICATION.md                          | closed |
| T-43-08   | Tampering (prune over-aggression)        | `no-url` events becoming prune-eligible                          | mitigate    | `no-url` excluded from `isTerminalDead` (`:794`), sidecar count, and both prune paths; "no-url NEVER pruned on EITHER trigger (D-08 pin)" (cronPrune test `:298`)                                                          | closed |
| T-43-09   | Tampering (flaky-host evasion)           | attemptCount reset semantics                                     | mitigate    | `unknown` preserves count (`:864-866`); `live` resets to 0; accumulation test "dead-run with an unknown blip preserves history and accumulates past >=3" (sweep test `:271`)                                               | closed |
| T-43-10   | DoS (sweep degrade-open)                 | persistLiveness/buildProbeCandidates throw in cron post-step     | mitigate    | Cron post-step try/catch (`llmExtractionPipeline.ts:644-675`); per-event no-url write also try/caught (`urlLiveness.ts:1016`)                                                                                              | closed |
| T-43-11   | Info Disclosure                          | Creds used by sampler script                                     | mitigate    | Env-only: `UPSTASH_REDIS_REST_URL/TOKEN` (`sample-pruned-urls.ts:167-168`), `DASHBOARD_PASSWORD` (`:268`); no secret printed or written (`:52`)                                                                            | closed |
| T-43-12   | Repudiation/abuse (probe-as-scanner)     | Browser-UA re-probe of ~20+ URLs                                 | mitigate    | Sequential loop with 1500ms default delay (`:85,343,357`); bounded `limit` default 20 (`:80`); degrade-open                                                                                                                | closed |
| T-43-13   | Tampering (SSRF via stored URL)          | Re-probing URLs read from Redis                                  | mitigate    | Re-probes only recorded `lastUrlProbed` from pipeline-vetted entries (`:205,247`); degrade-open `catch → 'dead-host'` (`:135`)                                                                                             | closed |
| T-43-14   | Tampering (destructive prune over-reach) | Cron prune of bot-blocked-but-live 403 articles                  | mitigate    | Cron-only 403 exclusion, prune-filter-local (`urlLiveness.ts:1246`); `isTerminalDead` unchanged; "403 SKIPPED on cron but PRUNED on manual" (cronPrune test `:256`); evidence-gated DEMOTE (20/20 prod 403s live)          | closed |
| T-43-15   | Tampering (silent prune widening)        | Future status silently prune-eligible                            | mitigate    | cronPrune tests pin `unknown` (`:286`) and `no-url` (`:298`) as never-prunable on BOTH triggers                                                                                                                            | closed |
| T-43-16   | Info Disclosure                          | `evidence` surfaced via `/api/operator-status`                   | accept      | Aggregator Bearer-gated via `dashboardAuth` (`operator-status.ts:340`, Phase 32 V4 unchanged); evidence is ≤200-char diagnostic, no secrets; Phase 44 must render as TEXT not HTML                                         | closed |
| T-43-17   | DoS (degrade-open read)                  | `buildDeadUrlSample` reading malformed/old entry                 | mitigate    | `value.evidence ?? null` (`operator-status.ts:266`); SCAN try/catch returns `[]` (`:230-231,274`)                                                                                                                          | closed |
| T-43-SC   | Tampering (supply chain)                 | npm installs (×5 plans)                                          | n/a         | Zero package.json/package-lock.json changes across `main..HEAD`; all 5 SUMMARYs report `added: []`                                                                                                                         | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## Accepted Risks Log

| Risk ID  | Threat Ref | Rationale                                                                                                                                                                                                                                                                              | Accepted By          | Date       |
| -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------- |
| AR-43-01 | T-43-01    | ~5000 prod liveness entries lack `evidence`; writer-only Zod parse means readers cast generically and coerce to null safely; all TTLs ≤7d so the population fully turns over within a week — no migration code needed (D-17)                                                           | operator (plan-time) | 2026-06-09 |
| AR-43-02 | T-43-07    | A dead SPA link surviving the soft-404 heuristic is within the asymmetric precision-first error budget; GHOST-09 prunedIds sample is the empirical backstop. SC-3 FLAG (8 live URLs swept by the _pre-fix_ prune) documents the pre-fix behavior this phase's D-15 demotion remediates | operator (plan-time) | 2026-06-09 |
| AR-43-03 | T-43-16    | `evidence` is a ≤200-char operator-facing diagnostic behind the existing Bearer gate; no secrets. Carry-forward: Phase 44 must render `evidence` as TEXT, not HTML                                                                                                                     | operator (plan-time) | 2026-06-09 |

_Accepted risks do not resurface in future audit runs._

---

## Security Audit Trail

| Audit Date | Threats Total                             | Closed | Open | Run By                      |
| ---------- | ----------------------------------------- | ------ | ---- | --------------------------- |
| 2026-06-09 | 22 (17 STRIDE + 5 supply-chain instances) | 22     | 0    | gsd-security-auditor (opus) |

Auditor notes (informational, non-blocking):

- SC-3 recorded as FLAG in 43-VERIFICATION.md:170 — honest record of pre-fix prune behavior under T-43-07's accepted risk, remediated by the D-15 cron-only 403 demotion this phase ships.
- Plan 04 checkpoint auto-resolved under `--auto` (read-only sampler against prod); documented in 43-VERIFICATION.md:123. No writes, no new credentials — process-acceptable.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-09
