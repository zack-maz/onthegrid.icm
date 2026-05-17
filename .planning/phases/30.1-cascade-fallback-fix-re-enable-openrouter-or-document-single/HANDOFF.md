# Phase 30.1 — Handoff (pick up in a fresh session)

> **Resume in a clean `/clear`'d session with:** `/gsd-discuss-phase 30.1`
> Everything below is pre-staged so discuss-phase has rich seed material.

## TL;DR (60-second briefing)

Phase 30 (NIM Throttle Characterization + Cascade Tuning) shipped clean —
PR [#20](https://github.com/zack-maz/onthegrid.icm/pull/20). Immediately after merge,
the operator noticed OpenRouter never fired during either Run 1, Run 2, or
the 04:00 UTC daily cron. Investigation found `skipOpenRouter: true` is
hardcoded in `server/lib/llmEventExtractor.v3.ts:622, 929` — the "cascade"
is actually NIM-only.

Phase 30.1 exists to either **re-enable the OpenRouter fallback** (if the
free-tier rate-limit problem from Phase 27.4.4 has improved) or **document
the single-provider reality honestly** in the architecture doc + ADR-0010
so future operators don't get misled.

## Branch + commit state when you pick this up

- **Phase 30 branch:** `feature/30-nim-throttle-characterization` — pushed,
  PR [#20](https://github.com/zack-maz/onthegrid.icm/pull/20) open against
  `main`. Phase 30 commits + the Phase 30.1 scaffold commits are all on
  this branch. **Wait for PR to merge before branching for 30.1 work** (per
  the branch-per-phase convention; never commit to main directly).

  Once merged: `git checkout main && git pull && git checkout -b feature/30.1-cascade-fallback-fix`

- **Roadmap entry:** `.planning/ROADMAP.md` line 149 has Phase 30.1 marked
  `(INSERTED)` with placeholder Goal/Requirements/Plans. discuss-phase
  fills these in.

- **Seed context:** `30.1-CONTEXT-SEED.md` in this directory has the bug
  evidence, historical context, implications, open questions, and three
  scope options. discuss-phase should consume this — don't re-derive.

## The bug, in one paragraph

`server/lib/freeClaudeRouter.ts` lines 341–363 build a provider cascade
`[NIM, OpenRouter]`. The v3 extractor passes `skipOpenRouter: true` (lines
622 + 929 of `llmEventExtractor.v3.ts`), which filters OpenRouter out of
the cascade entirely. So when NIM 429s and the breaker opens, batches
get `reason: "skipped:breaker"` and **drop with zero OpenRouter
attempts**. The 04:00 UTC 2026-05-17 cron is the smoking gun: NIM 39
rate_limit errors, breaker tripped, 50+ batches dropped, OpenRouter
`used: 0 / cap: 200`.

## The decisions discuss-phase needs to resolve

From `30.1-CONTEXT-SEED.md` "Open questions":

1. **Re-test OpenRouter free-tier rate limits.** Has it improved since
   Phase 27.4.4 (~March 2026)? Quick experiment: temp endpoint hitting OR
   N times with single-event payload, count rate_limit responses. <50%
   fail → viable. >90% fail → not worth it.

2. **Right behavior when NIM breaker trips:** (a) try OR, (b) drop (current),
   (c) pause new extractions for rest of cron window, (d) switch NIM model.

3. **Dashboard surface for cascade-degraded state:** currently `/api/health`
   shows `llmEvents: healthy` even when 50/213 batches were dropped. Hide
   or surface?

4. **Cost vs free-tier tradeoff:** paid OpenRouter (~$0.04/day for full coverage).

5. **NIM rate-limit window itself:** observed `used: 45 / cap: 40` —
   the rolling-window limiter let batches through faster than NIM
   absorbed. Tighten? Make adaptive?

## Three scope options to pick from

| Tier                    | What it does                                                                                                                                                          | Commits |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **Minimum**             | Amend architecture doc + ADR-0010 to say "NIM-only active; OR dormant pending re-validation." No code change.                                                         | 1       |
| **Right** (recommended) | Re-test OR free-tier. If viable: remove `skipOpenRouter: true` from both v3.ts call sites + redeploy + observe. If not: document why + plan paid OR as Phase 31 work. | 2-3     |
| **Full**                | Above + dashboard surface for cascade-degraded state + DLQ-threshold alert. Probably warrants its own phase number, not 30.1.                                         | 5-8     |

## Code pointers

| File                                                        | Line(s)                                 | What lives here                                                                                   |
| ----------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `server/lib/freeClaudeRouter.ts`                            | 341–363                                 | Cascade construction; `includeOpenRouter = !opts.skipOpenRouter`                                  |
| `server/lib/llmEventExtractor.v3.ts`                        | 622, 929                                | The two `skipOpenRouter: true` call sites — your edit targets                                     |
| `server/lib/llmCircuitBreaker.ts`                           | (whole file)                            | Breaker logic — opens at >30% error rate in 10-call window                                        |
| `server/__tests__/lib/freeClaudeRouter.test.ts`             | 262–273                                 | P3 test asserts current `skipOpenRouter=true` behavior — **needs rewrite if you remove the flag** |
| `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` | (Phase 30 sub-block + `<expand_at_36>`) | Amend here if Minimum scope; add Phase 30.1 sub-block if Right scope                              |
| `docs/architecture/llm-pipeline-reliability.md`             | "Tuned Defaults" + "Retired Mechanisms" | Same — either amend Phase 30's section or append Phase 31 placeholder content                     |

## Evidence to cite in PLAN.md (already verified)

From prod Redis `dev: events:llm-summary:v3` after 04:00 UTC 2026-05-17 cron:

```json
{
  "errorTaxonomy": {
    "nvidia_nim": {"rate_limit": 39, "timeout": 0, "...": 0},
    "openrouter": {"rate_limit": 0, "timeout": 0, "...": 0}
  },
  "rateLimit": {
    "nvidia_nim": {"used": 45, "cap": 40, "window": "minute"},
    "openrouter": {"used": 0, "cap": 200, "window": "day"}
  },
  "routingTrace": [
    {"batch": 30, "provider": "nvidia_nim", "reason": "primary"},
    {"batch": 167..212, "provider": "nvidia_nim", "reason": "skipped:breaker"}
  ]
}
```

Read it yourself for fresh data:

```bash
set -a; source .env.local; set +a
export CACHE_KEY_PREFIX="dev: "
node --env-file=.env.local -e "
import('@upstash/redis').then(async ({ Redis }) => {
  const r = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
  const sum = await r.get('dev: events:llm-summary:v3');
  const d = sum.data ?? sum;
  console.log('errorTaxonomy:', JSON.stringify(d.errorTaxonomy, null, 2));
  console.log('rateLimit:', JSON.stringify(d.rateLimit, null, 2));
  console.log('routingTrace bypassed batches:', d.routingTrace.filter(x => x.reason.startsWith('skipped')).length);
});
"
```

## Out of scope for Phase 30.1 (file these separately if discuss-phase agrees)

- **Eval-harness fixture not bundled into Vercel deploy.** Causes
  `evalScore.total: 0` in every prod run. Phase 30 was the first to
  notice. Could be 30.2 or roll into Phase 31's prep.
- **Diff filter mystery in `llmExtractionPipeline.ts`** —
  `groups.filter((g) => !cachedLlmKeys.has(g.key))` never matches because
  `g.key` is `20513-19-18` while `e.id` is `llm-v3-grp-20513-19-18`. The
  cron re-processes the full batch set every day (~2× wasted work). Easy
  fix, probably 30.3 or a Phase 31 sub-plan.
- **CACHE_KEY_PREFIX whitespace gotcha** — `node --env-file-if-exists=`
  strips trailing whitespace; analyzer breaks unless you
  `export CACHE_KEY_PREFIX="dev: "` manually. Worth a Plan 01 follow-up
  in the analyzer's `--help`.

## Pre-flight before discuss-phase

```bash
# Confirm Phase 30 merged to main
gh pr view 20 --json state --jq .state  # expect "MERGED"

# If not merged yet:
gh pr merge 20 --squash --delete-branch  # or whatever merge mode you prefer

# Cut new branch from clean main
git checkout main && git pull
git checkout -b feature/30.1-cascade-fallback-fix

# Confirm scaffold present
ls .planning/phases/30.1-cascade-fallback-fix-re-enable-openrouter-or-document-single/
# expect: 30.1-CONTEXT-SEED.md, HANDOFF.md (this file), .gitkeep

# Then:
/gsd-discuss-phase 30.1
```

## Why this isn't a Phase 30 verification failure

Phase 30 closed cleanly because:

- All 7 plans landed
- All success criteria from each plan PASSED (the `evalScore.total > 0`
  criterion was documented as a known blocker before commit, not a
  surprise verification miss)
- Both deploy gates (Gate 1 hard-kill regression + Gate 2 eval drift)
  were evaluated; Gate 1 PASS, Gate 2 INCONCLUSIVE documented

The cascade bug is **gap-closure work** discovered by operator review at
the phase boundary. That's the whole point of the operator review step.
Phase 30.1 is the correct mechanism for handling it — phase 30 doesn't
need to be re-opened.

## Author

Drafted by the executing agent at the close of Phase 30, 2026-05-17.
Operator: Z. Mazaheri caught the OpenRouter-never-fired observation that
triggered this whole investigation.
