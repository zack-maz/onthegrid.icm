---
phase: 38
slug: llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-04
---

# Phase 38 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (all 6 plans carried `<threat_model>` blocks). Auditor ran in **verify-mitigations** mode — confirm each mitigation exists, no new-threat scanning.

---

## Trust Boundaries

| Boundary                                                               | Description                                                                                                                               | Data Crossing                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| client → `/api/operator-status`                                        | Bearer-gated operator aggregator; must observe 401/503 never 500 under Redis death (no stack-trace info leak)                             | aggregate operator status (non-secret) |
| client → quota-gated prune/replay endpoints                            | per-Bearer quota counter via `redis.incr`; must degrade-open (503-not-500)                                                                | Bearer fingerprint + quota counter     |
| Open-Meteo upstream → `water:precip` cache                             | untrusted upstream batch; sentinel must not let a failure masquerade as healthy                                                           | precipitation anomaly batch            |
| env config → provider cascade                                          | `OPENROUTER_API_KEY` presence gates dormant provider; deleting `CEREBRAS_API_KEY`/`GROQ_API_KEY` must not change NIM-only runtime cascade | API key presence (gating only)         |
| `/llm-status` aggregator → client                                      | removing `pipelineFlips` from the wire contract must not break the degrade-open `Promise.all`                                             | LLM pipeline status metadata           |
| live Redis (`events:llm:v3`, `news:gdelt`) → audit script              | read-only; audit must never write back / mutate the corpus (D-07 non-destructive)                                                         | cached event/news corpus               |
| event source URLs → tier classification                                | URLs are untrusted GDELT strings; `getHighestTier` normalizes them                                                                        | source URL strings                     |
| Overpass upstream → `romanize()` → search/display                      | untrusted OSM name strings flow through transliteration into search index + DOM; must not enable injection (XSS / query injection)        | OSM facility name strings              |
| `transliteration` package install                                      | new prod dependency — blocking human checkpoint before install                                                                            | npm package (build-time)               |
| Vercel serverless entry (`createApp()` memoized) → concurrent requests | Fluid Compute runs multiple requests per instance; per-request global mutation could leak state across operators                          | per-request state                      |
| `news:gdelt` OSINT clusters → corroboration boost                      | untrusted news drives a confidence boost; strict keyword gate prevents coincidental corroboration inflating scores                        | OSINT cluster text                     |
| dedup pre-pass → raw `events:gdelt` cache                              | pass must be read-and-filter only; mutating raw corpus would violate data integrity (D-07)                                                | raw GDELT event corpus                 |

---

## Threat Register

| Threat ID  | Category                       | Component                                                     | Disposition    | Mitigation (verified evidence)                                                                                                                                                                              | Status |
| ---------- | ------------------------------ | ------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-38.01-01 | Information disclosure         | `/api/operator-status` under Redis death                      | mitigate       | Per-section try/catch + `cacheGetSafe` degrade-open (`operator-status.ts:282-490`); chaos `redis-death.test.ts:383-390` asserts 200/401/503 never 500 with all 11 raw-redis methods mocked dead             | closed |
| T-38.01-02 | Denial of service              | quota `redis.incr` path (pruneQuota/replayQuota)              | mitigate       | Replay quota → 503 `replay_quota_unavailable` (`events.ts:511-518`); prune → 503 `prune_failed` (`events.ts:616-639`); `quota-chaos.test.ts:115-136` mocks only `incr`/`expire`, asserts 503-not-500        | closed |
| T-38.01-03 | Tampering (signal integrity)   | actorMatchRate 0-vs-null + health token + Open-Meteo sentinel | mitigate       | `actorMatchRate = actorTotal===0 ? null : …` (`llmEvalHarness.ts:404`); health token split (`health.ts:448`); Open-Meteo sentinel `{data:[],failed:true}` (`water.ts:416-421`)                              | closed |
| T-38.01-SC | Tampering (supply chain)       | `npm audit fix` (qs) dependency update                        | mitigate       | `qs` advisory fixed lockfile-only; `git diff main…HEAD package.json` shows no `qs` change, no new package                                                                                                   | closed |
| T-38.02-01 | Tampering                      | OpenRouter env-gating change (PURGE-08)                       | mitigate       | `getOpenRouterClient()` returns null without key (`freeClaudeRouter.ts:242-243`); provider entry preserved (`:368`); dead daily-cap counter reduced to tombstone comment, zero live readers                 | closed |
| T-38.02-02 | Denial of service              | `/llm-status` after pipelineFlips removal                     | accept         | Each `Promise.all` block already `.catch(() => [])` degrades-open (`events.ts:408-409`); removing one entry cannot introduce a 5xx — LOW                                                                    | closed |
| T-38.02-03 | Information disclosure         | deleted env keys (CEREBRAS/GROQ)                              | mitigate       | Keys removed from `config.ts` (only tombstone comment `:30`); zero production readers across `server/`; keys had `.default('')` so no secret exposed                                                        | closed |
| T-38.02-SC | Tampering (supply chain)       | no package installs in this plan                              | accept         | Pure deletion/refactor; only phase-wide dep add is `transliteration` (plan 04); plan 02 supply-chain surface unchanged                                                                                      | closed |
| T-38.03-01 | Tampering                      | audit script writing to corpus                                | mitigate       | **Grep-gate run:** `audit-gdelt-corpus.ts` has ZERO write calls — only two `cacheGetSafe` reads (`:307-308`); no `cacheSet`/`redis.set`/`.incr`/`.del`                                                      | closed |
| T-38.03-02 | Information disclosure         | audit report artifact committed to repo                       | accept         | `gdelt-corpus-audit.json` holds aggregate counts + public GDELT source domains; no secrets — LOW                                                                                                            | closed |
| T-38.03-SC | Tampering (supply chain)       | no package installs (tsx already devDep)                      | accept         | tsx pre-existing devDep; no new dependency in plan 03                                                                                                                                                       | closed |
| T-38.04-01 | Tampering / injection          | romanize() output → search index + React render               | mitigate       | **Grep-gate run:** zero `dangerouslySetInnerHTML` consuming `nameLatin` in `src/`; rendered via JSX text + `title=` attr (React auto-escapes); string-literal search match (`searchUtils.ts:53-54`)         | closed |
| T-38.04-02 | Tampering (supply chain)       | `transliteration` supply chain                                | mitigate       | Blocking human-verify checkpoint (38-04-PLAN Task 0); lockfile shows zero deps + no postinstall (`package-lock.json:13759-13771`)                                                                           | closed |
| T-38.04-03 | Spoofing (data quality)        | generic-name romanization bypassing the gate                  | mitigate       | `GENERIC_OSM_NAME_RE` preserved post-romanization (`overpass-water.ts:207,211`); test asserts bare "Dam" still rejected (`overpass-water.test.ts:2288-2303`)                                                | closed |
| T-38.04-SC | Tampering (supply chain)       | `npm install transliteration@2.6.1`                           | mitigate       | Pinned exact `2.6.1` (no `^`) (`package.json:84`); blocking human checkpoint; lockfile entry has no `dependencies` block, no install script                                                                 | closed |
| T-38.05-01 | Information disclosure         | per-request global state leak under Fluid Compute concurrency | mitigate       | Smoke `vercel-entry.test.ts:144-177` (2 sequential + 4 concurrent `/health`, per-request `generatedAt`, no leak); `llmProgress` Redis write-through (`llmProgress.ts:543,581`)                              | closed |
| T-38.05-02 | Tampering                      | deploy-path migrations (PRO-01/02)                            | accept (defer) | Deferred with rationale (`deployment.md:180-206`) — not touching prod deploy path mid-cleanup is the safer disposition; Phase 999.2 stays open                                                              | closed |
| T-38.05-SC | Tampering (supply chain)       | global Vercel CLI bump (dev only)                             | accept         | No `vercel` in `package.json` — global dev-tool only, not a production dependency                                                                                                                           | closed |
| T-38.06-01 | Tampering (data integrity)     | dedup merging distinct events / corpus mutation               | mitigate       | **Grep-gate run:** `eventGrouping.ts` ZERO redis/cache calls (pure read-and-filter); conservative AND-gate `DEDUP_RADIUS_KM=5` + `DEDUP_TITLE_JACCARD=0.85` (`:30-31`); never writes back to `events:gdelt` | closed |
| T-38.06-02 | Spoofing (false corroboration) | coincidental same-city-same-day boost                         | mitigate       | `GENERIC_STOPWORDS` strict keyword gate (`corroboration.ts:65,121,169`); all 3 gates required; test asserts 2-gate same-city-diff-actor → `boost: 0` (`corroboration.test.ts:82-102`)                       | closed |
| T-38.06-03 | Tampering                      | compositeScore reordering vs corpus mutation                  | mitigate       | `compositeScore` ADDITIVE `.optional()` (`llmSchema.ts:182`); `applyCompositeOrdering` returns shallow copies (`events.ts:308-321`), never writes `events:llm:v3`; old cached events validate without it    | closed |
| T-38.06-SC | Tampering (supply chain)       | no package installs                                           | accept         | Pure extension of existing primitives; no npm install                                                                                                                                                       | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## Accepted Risks Log

| Risk ID  | Threat Ref | Rationale                                                                                                                                                           | Accepted By          | Date       |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------- |
| AR-38-01 | T-38.02-02 | `/llm-status` already degrades-open: each `Promise.all` block `.catch(() => [])`. Removing the `pipelineFlips` field cannot introduce a 5xx. LOW severity.          | gsd-security-auditor | 2026-06-04 |
| AR-38-02 | T-38.02-SC | Plan 02 is pure deletion/refactor — no npm/pip/cargo install. Supply-chain surface unchanged.                                                                       | gsd-security-auditor | 2026-06-04 |
| AR-38-03 | T-38.03-02 | Committed `gdelt-corpus-audit.json` contains aggregate counts + already-public GDELT source domains. No secrets. LOW severity.                                      | gsd-security-auditor | 2026-06-04 |
| AR-38-04 | T-38.03-SC | No new dependency in plan 03; tsx is the existing devDep script runner.                                                                                             | gsd-security-auditor | 2026-06-04 |
| AR-38-05 | T-38.05-02 | PRO-01/02 deploy-path migrations deferred — not mutating the production deploy path mid-cleanup is the safer disposition. Tracked under Phase 999.2 (remains open). | gsd-security-auditor | 2026-06-04 |
| AR-38-06 | T-38.05-SC | Global Vercel CLI bump is a dev-tool only — not a `package.json` production dependency. No production supply-chain change.                                          | gsd-security-auditor | 2026-06-04 |
| AR-38-07 | T-38.06-SC | Pure extension of existing primitives (dedup / corroboration / additive scoring); no npm install.                                                                   | gsd-security-auditor | 2026-06-04 |

_Accepted risks do not resurface in future audit runs._

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By                                               |
| ---------- | ------------- | ------ | ---- | ---------------------------------------------------- |
| 2026-06-04 | 22            | 22     | 0    | gsd-security-auditor (opus), verify-mitigations mode |

**Audit notes (non-blocking):**

- Documentation imprecision (not a security gap): the `skipOpenRouter` ADR-0010 citation line-numbers drifted across artifacts (PLAN `629/951`, 38-02-SUMMARY `630/952`, actual `632/954`). The OpenRouter gating code itself (`freeClaudeRouter.ts:243`) is correct and verified. No mitigation impact.
- T-38.04-03 honest scope note: the strict-generic filter rejects literal English generics ("Dam"/"reservoir"); a romanized Arabic "سد"→"Sd" does not match the English regex (documented in the test, accepted by design). The mitigation intent — romanization does NOT weaken the gate — holds: gate behavior is identical before/after romanization.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-04
