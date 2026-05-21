---
phase: 32
review_date: 2026-05-21
depth: standard
files_reviewed: 7
files_reviewed_list:
  - server/lib/urlLiveness.ts
  - server/lib/pruneQuota.ts
  - server/lib/operatorAudit.ts
  - server/lib/llmExtractionPipeline.ts
  - server/routes/events.ts
  - server/routes/operator-status.ts
  - src/components/ui/DevApiStatus.tsx
status: critical_resolved
critical_count: 0
critical_resolved: 2
warning_count: 6
info_count: 5
findings:
  critical: 0
  critical_resolved: 2
  warning: 6
  info: 5
  total: 13
resolutions:
  CR-01: "Resolved 2026-05-21 in commit 53dd880 — HTTP route trigger hardcoded to 'manual'; 2 regression tests added"
  CR-02: "Resolved 2026-05-21 in commit d85ddc8 — bracket-stripping + IPv6 alternates + fc/fd hex disambiguation; 7 regression tests added"
---

# Phase 32: Code Review Report

**Reviewed:** 2026-05-21
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 32 ships a URL-liveness probe sweep, a sidecar count, an operator dashboard surface, and a Bearer-gated `POST /api/events/prune-dead-urls` endpoint with a 50/24h per-Bearer quota. The implementation is well-commented and mostly follows the documented threat model + pitfalls — sidecar count integrity (INCR/DECR pairing), sweep deadline plumbing (cron + 800s − 60s margin), and the chaos-test contract (200|503, never 500) are all wired correctly.

However two independent issues compromise the security/integrity invariants that the phase set out to defend:

1. **An authenticated operator can bypass the 50/24h prune quota AND spoof their identity in the audit log** by sending `{"trigger":"cron"}` in the POST body. The route trusts the request-body `trigger` value to decide both whether to consume a quota slot and what `bearerFingerprint` to record in `operator:audit-log`.
2. **The SSRF guard regex does NOT block IPv6 loopback / link-local / ULA addresses** when they appear in a stored URL, because `URL.hostname` returns the address with the surrounding `[…]` brackets (e.g. `'[::1]'`) and the regex anchors at `^` against literal `::1` / `fc` / `fd` without accounting for the bracket prefix. The probe-test suite at `urlLiveness.probe.test.ts:181-200` only exercises IPv4 cases.

Several Warning-tier issues compound those: the dead-URL drill-down's outer error handler returns 500 (not the documented chaos-contract 503/200 degrade-open shape used elsewhere in the same file); the probe + prune post-step never runs on cooldown / no-raw-events / pipeline-busy short-circuit paths even though those paths are precisely the long-quiet windows where dead URLs accumulate; the persistLiveness sidecar can permanently drift if `cacheSetSafe` silently fails between INCR transitions; and the dashboard prune button gives no UI feedback on a 503 chaos response.

## Critical

### CR-01: Prune-quota bypass + audit-log identity spoof via request body trigger

**File:** `server/routes/events.ts:539-571`
**Severity:** Critical

**Issue:** The `POST /api/events/prune-dead-urls` handler reads `trigger` from the request body and uses it for two security-relevant decisions:

1. **Quota gate** (line 555): `if (trigger !== 'cron')` — `'cron'` skips `checkPruneQuota()` entirely.
2. **Audit-log fingerprint** (passed to `pruneDeadUrlEvents`, which at `urlLiveness.ts:813-815` records `bearerFingerprint: opts.trigger === 'cron' ? 'cron:refresh-events' : opts.fingerprint`).

Any operator with a valid `DASHBOARD_PASSWORD` Bearer can therefore:
- Drain the events cache without rate-limiting (50/24h ceiling does not apply).
- Have the audit log record the action as `bearerFingerprint: 'cron:refresh-events'` instead of their own SHA-256 fingerprint — anonymizing the operator and breaking forensic attribution.

CONTEXT D-11 says the cron path uses `'cron:refresh-events'` as its fingerprint *because the call originates inside the cron handler*, not because the request body says so. In the actual implementation, the cron path calls `pruneDeadUrlEvents()` *directly* (`llmExtractionPipeline.ts:491`) — it never goes through this HTTP route. The route's `trigger: 'cron'` branch therefore has no legitimate caller; it is purely an attack surface.

The in-code comment at `events.ts:529-532` describes this as a documented bypass for operator-simulated cron, but D-15 says the cron's `cron:refresh-events` fingerprint bypasses quota — *not* that operators can claim that fingerprint.

**Fix:** Reject `trigger: 'cron'` over the HTTP route entirely. Force the trigger and fingerprint to come from authentication context, not the request body:

```ts
eventsRouter.post('/prune-dead-urls', dashboardAuth, async (req, res) => {
  // Trigger is always 'manual' over HTTP. The cron post-step calls the
  // helper directly (llmExtractionPipeline.ts), never via this route.
  const trigger = 'manual' as const;
  const fingerprint = bearerFingerprint(process.env.DASHBOARD_PASSWORD ?? '');

  try {
    const quota = await checkPruneQuota(fingerprint);
    if (!quota.allowed) {
      res.set('Retry-After', String(quota.retryAfterSeconds));
      return res.status(429).json({
        error: 'prune_quota_exceeded',
        message: `Prune quota reached: ${quota.cap} of ${quota.cap} in last 24h.`,
        resetsAt: quota.resetsAt,
      });
    }
    const result = await pruneDeadUrlEvents({ trigger, fingerprint });
    return res.json(result);
  } catch (err) {
    return res.status(503).json({ error: 'prune_failed', detail: String(err).slice(0, 200) });
  }
});
```

Add a route-level test that asserts a POST with `{"trigger":"cron"}` still INCRements the quota counter AND still records the operator's bearer fingerprint in `operator:audit-log` (not the literal `'cron:refresh-events'`).

---

### CR-02: SSRF guard does not block IPv6 loopback / link-local / ULA hosts

**File:** `server/lib/urlLiveness.ts:200-205`
**Severity:** Critical

**Issue:** `PRIVATE_HOST_REGEX` is matched against `URL.hostname`. Node's `URL` parser returns IPv6 hosts WITH surrounding brackets (verified at the REPL):

```
> new URL('http://[::1]/').hostname
'[::1]'
> new URL('http://[fd00::1]/').hostname
'[fd00::1]'
> new URL('http://[fe80::1]/').hostname
'[fe80::1]'
```

The regex `^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1|fc|fd)` is anchored at `^`. Against `'[::1]'`, none of the alternates match the leading `[` character. A stored URL like `http://[::1]:6379/` therefore PASSES the SSRF guard and `probeUrl` issues an outbound fetch against the IPv6 loopback. Same gap for `[fd00::]/8` (ULA), `[fe80::]/10` (link-local), and IPv4-mapped IPv6 like `[::ffff:127.0.0.1]`.

The probe-test suite at `server/__tests__/lib/urlLiveness.probe.test.ts:181-200` only exercises IPv4 cases (`localhost`, `10.0.0.1`, `169.254.169.254`); the IPv6 gap is not detected.

This is defense-in-depth — Vercel's egress is unlikely to route to these addresses — but the JSDoc explicitly claims coverage of `::1` and `fc00::/7`, so the gap contradicts the documented threat model.

**Fix:** Strip brackets before regex-matching, and tighten the IPv6 alternates so they correctly recognize the bracket-wrapped form. Add explicit `[::]`, `[fe80::]/10`, and IPv4-mapped-IPv6 cases:

```ts
function isPrivateHost(hostname: string): boolean {
  // Node's URL.hostname returns IPv6 with surrounding brackets, e.g. '[::1]'.
  // Strip them before pattern-matching so the v6 alternates anchor correctly.
  const h = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  return PRIVATE_HOST_REGEX.test(h)
    || /^::1$/i.test(h)
    || /^::$/i.test(h)
    || /^::ffff:/i.test(h) // v4-mapped v6 — re-run the v4 portion if needed
    || /^fe80:/i.test(h)
    || /^f[cd][0-9a-f]{2}:/i.test(h); // ULA fc00::/7 with hex disambiguation
}
```

Add tests for `http://[::1]/`, `http://[fd00::1]/`, `http://[fe80::1]/`, and `http://[::ffff:127.0.0.1]/`.

Also note the current regex anchors `fc` / `fd` without colon disambiguation — `fc.example.com` and `fdcompany.com` would be false-positive-blocked. Tightening with `f[cd][0-9a-f]{2}:` resolves both directions.

## Warning

### WR-01: Operator-status route returns 500 (not 200 degrade-open) when SMEMBERS or Redis get throws synchronously

**File:** `server/routes/operator-status.ts:319-322`
**Severity:** Warning

**Issue:** The outer `try/catch` (lines 205-322) translates any uncaught throw into HTTP 500. The block-level try/catches around `redis.smembers`, `redis.get(advEval)`, and `redis.get(URL_LIVENESS_COUNT_KEY)` do mitigate this for the read paths, but the inline `buildDeadUrlSample()` call at line 315 is itself a degrade-open helper that returns `[]` on throw — yet earlier code paths (e.g. `auditMembers.map((raw) => JSON.parse(raw))` — defensive but throws are caught with `null` return) also assume well-formed inputs.

The inline JSDoc at lines 302-306 explicitly says this route's happy-path "MUST NEVER bubble to the 500 handler (Pitfall 6 chaos contract for read-only routes)" — but the actual outer catch returns 500, not a degraded 200 with empty fields. Under chaos / Redis death, the dashboard goes 500-blank rather than rendering `{audit24h: 0, byBearer: [], advEval: null, prune: null}`.

**Fix:** In the outer catch, return a 200 with empty/null fields so the dashboard renders gracefully:

```ts
} catch (err) {
  log.error({ err }, '/api/operator-status failed');
  res.status(200).json({
    audit24h: 0,
    byBearer: [],
    advEval: null,
    prune: null,
    degraded: true,
  });
}
```

The client already gates on `opStatus?.prune != null` and `opStatus?.audit24h` shape — adding an explicit `degraded: true` lets the UI surface a degraded indicator without crashing.

---

### WR-02: Probe + prune post-step is skipped on cooldown / no-raw-events / llm-unconfigured / pipeline-busy paths

**File:** `server/lib/llmExtractionPipeline.ts:229-272` (early returns) vs. `:458-508` (probe/prune in finally)
**Severity:** Warning

**Issue:** The probe sweep and cron auto-prune are wired INSIDE the `safeWaitUntil` IIFE that only fires after the 6 dispatch-decision guards pass:

- Cooldown active (line 234) → returns BEFORE IIFE
- LLM unconfigured (line 246) → returns BEFORE IIFE
- No raw events (line 260) → returns BEFORE IIFE
- Pipeline busy (line 271) → returns BEFORE IIFE

On any of these early returns, the `runProbeSweep` + `pruneDeadUrlEvents` post-step does NOT run for that cron tick. The 4am UTC cron is the SOLE writer of `events:url-liveness:*` keys, so dead URLs accumulate silently across any extended cooldown / outage window. The very scenario where the dashboard is most useful (dead URLs are piling up) is the scenario where the cleanup pipeline is most likely to be skipped.

CONTEXT D-01/D-02 ("Probe pass runs AFTER `runRefreshExtraction()` resolves") can be interpreted either way, but the spirit is "probe is independent cleanup that should always converge." The current implementation couples probe to extraction dispatch.

**Fix:** Move the probe + prune post-step OUTSIDE the `safeWaitUntil` IIFE so it always runs regardless of extraction dispatch outcome. Either:

(a) Run it inline after the dispatch decision (cron handler can await this if budget allows), or
(b) Always launch a separate `safeWaitUntil` IIFE for the probe/prune that runs unconditionally:

```ts
// At end of runRefreshExtraction, regardless of dispatch outcome:
safeWaitUntil((async () => {
  try {
    const deadlineMs = cronStart + 800_000 - SWEEP_SAFETY_MARGIN_MS;
    const candidates = await buildProbeCandidates();
    const sweep = await runProbeSweep({ eventIdsWithUrls: candidates, deadlineMs });
    if (Date.now() < deadlineMs) {
      await pruneDeadUrlEvents({ trigger: 'cron' });
    }
  } catch (err) {
    log.error({ err }, 'phase 32 probe/prune post-step failed');
  }
})());
```

This guarantees probe coverage on every cron tick, decoupled from LLM extraction state.

---

### WR-03: Sidecar count drifts permanently on first-write transition when cacheSetSafe silently fails

**File:** `server/lib/urlLiveness.ts:464-524`
**Severity:** Warning

**Issue:** `persistLiveness` writes the per-event liveness entry via `cacheSetSafe` at line 501 (which swallows Redis errors per `cache/redis.ts:237-241`), then conditionally INCRements the sidecar at line 509. If `cacheSetSafe` silently fails (Redis write down), the per-event key is NOT updated — `prior` on the next sweep still reads as `null` or as the old state. But the sidecar was already INCR'd on this tick (assuming the count INCR happens to succeed — they hit different Redis paths).

On the NEXT sweep tick, `prior === null` (or still-old), `nextDead === true`, the transition logic again sees "not-dead → dead" and INCRements the sidecar AGAIN — even though it's the same event. The count drifts upward by 1 per failed write per sweep, and never self-heals (DECR only fires on dead→not-dead transitions which require the entry to actually exist with dead status).

The inline comment at 437-462 explicitly documents "Pitfall 6 — chaos-test contract holds" but the actual contract is that `cacheSetSafe` may silently no-op. The INCR path needs to be conditional on the entry actually being written.

**Fix:** Either skip the INCR when the entry write may have failed (check `memCache` vs `redis.get` round-trip), or — simpler — make `cacheSetSafe` return a boolean success flag and skip sidecar mutation on false:

```ts
// In server/cache/redis.ts:
export async function cacheSetSafe<T>(
  key: string, data: T, redisTtlSec: number,
): Promise<boolean> {
  memCache.set(key, { data, fetchedAt: Date.now() });
  try {
    await withTimeout(cacheSet(key, data, redisTtlSec), REDIS_OP_TIMEOUT_MS, `cacheSet(${key})`);
    return true;
  } catch {
    return false;
  }
}

// In urlLiveness.ts persistLiveness:
const persisted = await cacheSetSafe(key, next, ttlSecForStatus(next.status));
if (!persisted) return; // skip sidecar mutation when underlying write failed
```

Alternatively, document the drift behavior and add a periodic reconciliation pass that recomputes the sidecar from a SCAN.

---

### WR-04: Empty-cache early return skips audit-log entry, violating "all attempts logged" contract

**File:** `server/lib/urlLiveness.ts:769-772`
**Severity:** Warning

**Issue:** When `events:llm:v3` is empty, `pruneDeadUrlEvents` returns `{prunedCount: 0, prunedIds: []}` at line 771 WITHOUT writing the no-op audit-log entry that the parallel code path at line 808-820 writes when there are events but no terminal-dead candidates.

The JSDoc at line 808-810 explicitly justifies the second branch: "still write the audit-log entry so operator sees the no-op (forensic completeness)." The first branch silently omits this — operator clicks Prune, gets 200, but no audit trail of the attempt.

Production v3 cache is rarely empty (raw-GDELT bridge keeps it warm), so the path is uncommon, but it's still an inconsistency in the documented contract and the prompt's Focus Area 6 explicitly calls this out.

**Fix:** Add the audit-log write to the empty-cache branch:

```ts
if (events.length === 0) {
  await appendOperatorAuditEntry({
    timestamp: Date.now(),
    bearerFingerprint:
      opts.trigger === 'cron' ? 'cron:refresh-events' : (opts.fingerprint ?? 'unknown'),
    operation: 'prune-dead-urls',
    args: { trigger: opts.trigger, prunedCount: 0, prunedIds: [] },
    result: 'ok',
  });
  return { prunedCount: 0, prunedIds: [] };
}
```

Or refactor both no-op paths to share one terminal write block.

---

### WR-05: Dashboard prune button gives no UI feedback on 503 (chaos contract response)

**File:** `src/components/ui/DevApiStatus.tsx:1031-1053`
**Severity:** Warning

**Issue:** `pruneHandler` handles two response shapes:
- `res.status === 429` → set `pruneQuotaAlert`
- `res.ok` (200) → clear alert, refresh status

But the documented chaos-test contract returns `503 prune_failed` on Redis death. The handler falls through without updating state. The operator sees no toast, no error indicator, no spinner-removed — the button appears to do nothing. The thrown `catch` is also empty (line 1050).

This violates the "operator stays informed" UX expectation surrounding destructive actions.

**Fix:** Add a 503 (and generic error) branch that surfaces a transient error banner:

```ts
const [pruneError, setPruneError] = useState<string | null>(null);
const pruneHandler = async (): Promise<void> => {
  try {
    const res = await fetch('/api/events/prune-dead-urls', { /* ... */ });
    if (res.status === 429) {
      const body = await res.json() as { resetsAt?: string };
      setPruneQuotaAlert({ resetsAt: body.resetsAt ?? '' });
      setPruneError(null);
    } else if (res.ok) {
      setPruneQuotaAlert(null);
      setPruneError(null);
      void fetchOpStatus();
    } else {
      // 503 chaos-contract or other non-ok response
      const body = await res.json().catch(() => ({}));
      setPruneError(`Prune failed (${res.status}): ${body.error ?? 'unknown'}`);
    }
  } catch {
    setPruneError('Prune failed: network error');
  }
};
```

Render `pruneError` similarly to `pruneQuotaAlert` so the operator gets feedback on every state, not just 200/429.

Also: the button has no `disabled` state during the in-flight POST, so double-clicking fires two requests. Add `const [pruning, setPruning] = useState(false)` + `disabled={pruning}` to prevent duplicate calls.

---

### WR-06: SSRF guard regex matches `localhost.evil.com` as private (over-block)

**File:** `server/lib/urlLiveness.ts:200-201`
**Severity:** Warning

**Issue:** The pattern `^(localhost|...)` is not anchored at end-of-host or boundary. `localhost.evil.example.com` matches and is rejected with status `unknown`. Same false-positive class affects any hostname starting with `fc` or `fd` (e.g. `fc-barcelona.com`, `fdcompany.com`).

This is over-blocking, not security under-blocking — but it means legitimate publisher domains get permanently stuck at `unknown` status and operators can never determine their real liveness. They will not appear in the dead-URL dashboard or auto-prune.

**Fix:** Anchor the alternates to host-boundary characters (end of string or `:` for port / `.` for domain — but `.` is dangerous because `localhost.com` is a public domain):

```ts
const PRIVATE_HOST_REGEX =
  /^(localhost$|localhost:|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$|::$|fe80:|f[cd][0-9a-f]{2}:)/i;
```

This requires `localhost` to be the entire hostname or precede a port, and requires `fc`/`fd` to be followed by 2 hex chars + `:` (matching ULA shape).

## Info

### IN-01: 503 error response body echoes raw error message via `String(err)`

**File:** `server/routes/events.ts:578-581` (and similar at `events.ts:510-513` for replay)
**Severity:** Info

**Issue:** `detail: String(err).slice(0, 200)` may leak internal details (connection strings, stack-trace tails, Upstash error messages with hostnames) into the HTTP response body. Bearer-gated, so audience is the dashboard operator — low impact — but the operator is not necessarily the same trust tier as the deployment owner.

**Fix:** Replace with a sanitized error category lookup, or strip to error class name only:

```ts
detail: err instanceof Error ? err.name : 'unknown',
```

---

### IN-02: `attemptCount` reset comment is in JSDoc but not asserted by schema test

**File:** `server/lib/urlLiveness.ts:100-111`
**Severity:** Info

**Issue:** The "monotonic-with-reset on live-or-unknown" semantics for `attemptCount` are documented in the schema comment but the schema itself only validates `z.number().int().nonnegative()`. The cron auto-prune gate at `urlLiveness.ts:803` (`attemptCount >= 3`) depends on the writer correctly resetting on transitions. If a future writer regression accumulates monotonically (no reset), the cron auto-prune would prune flapping URLs after 3 *total* dead ticks rather than 3 *consecutive*.

**Fix:** Add behavioral tests in `urlLiveness.sweep.test.ts` (or a separate `persistLiveness.test.ts`) that assert:
- live → dead → live → dead transitions leave `attemptCount === 1`, not 2.
- dead → dead → dead transitions yield 1 → 2 → 3.
- unknown breaks the streak.

The `__test__` export at line 884-887 exposes `persistLiveness` for exactly this purpose; ensure these scenarios are covered.

---

### IN-03: Unused imports in operatorAudit JSDoc references `pipelineAudit` writers that no longer exist

**File:** `server/lib/operatorAudit.ts:6-7`
**Severity:** Info

**Issue:** JSDoc lists `POST /api/events/llm-pipeline` as a writer, but Phase 29 D-02 deleted that route. The list is now `llm-replay` and `prune-dead-urls`. Comment is stale.

**Fix:** Update the file-level JSDoc to reflect the current writer set:

```
 * Bounded Redis SADD set capturing every successful invocation of the
 * Bearer-gated operator-control endpoints:
 *   - POST /api/events/llm-replay/:groupKey (single-group re-extraction)
 *   - POST /api/events/prune-dead-urls (dead-URL splice; manual or cron)
```

---

### IN-04: `pruneHandler` not memoized; arrow `onClick` recreates per render

**File:** `src/components/ui/DevApiStatus.tsx:1031-1053` + `:1645`
**Severity:** Info

**Issue:** `pruneHandler` is declared inline on each render. The `onClick={() => void pruneHandler()}` also creates a new arrow on each render. Not a correctness bug; just inconsistent with `fetchOpStatus` (which IS memoized via `useCallback` per the MEDIUM-03 fix at line 921).

**Fix:** Wrap in `useCallback` for consistency:

```tsx
const pruneHandler = useCallback(async () => { /* ... */ }, [fetchOpStatus]);
```

---

### IN-05: SCAN cursor type cast unnecessary with newer `@upstash/redis` versions

**File:** `server/lib/urlLiveness.ts:779-782`, `server/routes/operator-status.ts:104-107`
**Severity:** Info

**Issue:** The `as [string | number, string[]]` cast is defensive against the documented Upstash signature drift. With the pinned version (`^1.37.0` per the JSDoc), the return type is now stable. The cast hides any future type narrowing the SDK might provide. Not a bug — just over-defensive.

**Fix:** Remove the explicit cast once a tsc check confirms the SDK's actual return type matches. Or keep the cast and add a comment with the SDK version baseline so it can be revisited on next bump.

---

_Reviewed: 2026-05-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
