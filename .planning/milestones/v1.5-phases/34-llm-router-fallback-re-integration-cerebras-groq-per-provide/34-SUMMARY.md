# Phase 34: LLM Router Fallback Re-integration — Summary

**Closed:** 2026-05-23
**Outcome:** `cerebras-groq-deferred` (operator decision — no probe ran)
**Requirements:** LLM-RELI-08, LLM-RELI-09, LLM-RELI-10, LLM-RELI-11 — all closed as deferred
**Plans executed:** 1 of 5 (34-05 close-out only; 34-01..04 skipped)

---

## Outcome at a glance

Phase 34 was inserted 2026-05-19 to widen the v3 LLM cascade with Cerebras + Groq free-tier fallbacks (deleted in Phase 29 SIMPLIFY-04), so NIM throttle events would stop translating into DLQ entries. Phase 31's Day-1 baseline (4 × `v3:timeout_watchdog` on a single PASS-day cron) was the empirical motivation. Per-provider eval scoring (`EvalScore.byProvider`) was the bounded quality lever paired with provider expansion.

**Final scope:** The operator chose to skip provisioning free-tier accounts at Cerebras + Groq rather than measure their rate-limit behavior. This triggered the "both providers deferred" branch baked into CONTEXT.md D-02 outcome table — a close-out path that requires no code change, only a deferral record. The phase closes as the empirical statement that "free-tier provider expansion is not the right lever right now."

This mirrors Phase 30.1's `nim-only` close-out precedent exactly. The active LLM cascade remains single-provider (NIM only); the Pitfall 1 raw-GDELT terminal fallback continues as the user-visible safety net when NIM is throttled.

## Cascade shape after Phase 34

| Slot     | Provider   | Status   | Notes                                                                                |
| -------- | ---------- | -------- | ------------------------------------------------------------------------------------ |
| Primary  | NVIDIA NIM | Active   | `qwen/qwen3.5-397b-a17b` per Phase 27.4.4 D-01 bake-off                              |
| Fallback | OpenRouter | Dormant  | `skipOpenRouter: true` at v3.ts:673, 996 per Phase 30.1 (free tier 90% rate-limited) |
| Fallback | Cerebras   | Deferred | Phase 34 — no probe, no adapter; operator deferred provisioning                      |
| Fallback | Groq       | Deferred | Phase 34 — no probe, no adapter; operator deferred provisioning                      |

## Why "deferred" is a load-bearing outcome (not a failure)

CONTEXT.md D-02 pre-baked three outcome buckets per provider (`<50%` → integrate, `50-90%` → middle-bucket defer, `≥90%` → defer) plus a combined "both deferred" close-out branch. Skipping the probe entirely is operationally equivalent to a "both deferred" probe outcome:

- No providers land in the cascade.
- The deferral rationale is recorded in ADR-0010 + reliability doc + CLAUDE.md.
- The planning artifacts under `.planning/phases/34-.../` remain as the ready-to-execute audit trail for any future provider-restoration phase.

The DLQ-baseline pain (Phase 31 Day-1's 4 × `v3:timeout_watchdog`) remains a known failure mode under the single-provider cascade. Mitigation candidates are enumerated in the ADR sub-block's "Phase-35-or-later follow-up candidates" list (paid provider tier, adaptive Retry-After NIM limiter, model swap).

## What was committed during planning (preserved as audit trail)

The 5 commits below are the audit trail of what was planned but not executed. They remain in `main`'s history and the planning artifacts remain under `.planning/phases/34-llm-router-fallback-re-integration-cerebras-groq-per-provide/`:

| Commit    | Artifact                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `19dbe34` | `34-CONTEXT.md` (33 decisions D-01..D-33) + `34-DISCUSSION-LOG.md`                                                                    |
| `0db7be5` | `34-RESEARCH.md` (provider catalog + code touchpoints + Validation Architecture; inline-written after researcher subagent crashed 2×) |
| `a57f0ee` | `34-01-PLAN.md` through `34-05-PLAN.md` (5 executable plans with frontmatter + tasks + must_haves)                                    |
| `53df299` | Plan-checker warnings fixed inline (0 blockers, 4 warnings) + STATE planned                                                           |
| (this)    | `34-SUMMARY.md` + ADR-0010 Phase 34 sub-block + reliability doc section + CLAUDE.md + ROADMAP/REQUIREMENTS flips                      |

## What was NOT done (and could be in a future phase)

If a future phase reverses the deferral, the artifacts under `.planning/phases/34-.../` are ready to execute:

- **Plan 34-01** (Probe Cerebras + Groq): write `scripts/probe-cerebras-groq.ts` mirroring `scripts/probe-openrouter.ts`; emit `probe-snapshot.json` with `summary.{rateLimitedCount, rateLimitedPct, latencyP50, latencyP95, decision}` per provider.
- **Plan 34-02** (Adapter restoration): extend `FreeProvider` union; add `getCerebrasClient()` + `getGroqClient()`; per-provider rate-limit gates (Cerebras `RollingWindow(5, 60_000)` per RESEARCH §1.1, Groq `RollingWindow(30, 60_000)` per RESEARCH §1.2); Redis daily-token keys.
- **Plan 34-03** (Per-provider eval): `providerProvenance` field on `enrichedEventV3` (additive-optional); `EvalScore.byProvider` shape; UI extension to `EvalScoreBlock`.
- **Plan 34-04** (Validation + DLQ): `v3:cascade_exhausted` DLQ reason; force-trigger cron evidence; `?skipPrimary=nvidia_nim` temporary validation flag.
- **Plan 34-05** (Phase close): ADR + reliability doc + CLAUDE.md + ROADMAP/REQUIREMENTS/STATE flips.

The CONTEXT.md decisions (D-01..D-33) and RESEARCH.md corrections (Cerebras model `qwen-3-235b-a22b-instruct-2507`, Cerebras 5 RPM, latencyP50/p95 schema extension, Vercel-env-var pre-deploy UAT) remain authoritative for any restoration attempt.

## Re-execution path (if deferred is reconsidered)

```bash
# 1. Provision free-tier API keys:
#    Cerebras: https://cloud.cerebras.ai/
#    Groq:     https://console.groq.com/
# 2. Append to .env.local:
#    CEREBRAS_API_KEY=...
#    GROQ_API_KEY=...
# 3. Re-open Phase 34:
#    Edit ROADMAP.md to flip the row back to [ ]; edit REQUIREMENTS.md to flip LLM-RELI-08..11 back to [ ]
#    (or insert a fresh decimal phase 34.1 with the same 5 plans and fresh LLM-RELI-12+ requirement IDs).
# 4. /gsd-execute-phase 34 --auto --no-transition
```

## Lessons / what informed the deferral

- **Probe-driven adapter restoration is a high-discipline pattern that pays off only when the operator has the provider credentials at hand.** Without keys provisioned, the first executable step (Plan 34-01 probe) blocks indefinitely. The CONTEXT.md "honest deferral" branch is the right escape hatch — it costs ~10 min of doc work and produces a durable decision record.
- **Two researcher subagent crashes this session** (401 auth + socket close, both without writing output) reinforced the value of inline orchestrator work for narrow research questions. The inline RESEARCH.md caught two stale CONTEXT.md assumptions (Cerebras `llama3.3-70b` → `qwen-3-235b-a22b-instruct-2507`; Cerebras `~30 RPM` → `5 RPM`) that the deferred adapter work would have wasted time on.
- **Phase 31 Day-1 DLQ baseline (4 × `v3:timeout_watchdog`)** remains the empirical motivation for SOME future mitigation. Adaptive Retry-After-aware NIM limiter is the leading candidate; it's a single-provider-friendly fix that doesn't require provider expansion.

---

_Phase: 34-llm-router-fallback-re-integration-cerebras-groq-per-provide_
_Status: ✓ CLOSED 2026-05-23 (cerebras-groq-deferred — operator decision)_
_Plans executed: 1 of 5 (34-05 close-out only)_
