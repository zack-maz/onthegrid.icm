/**
 * Phase 39 Plan 05 Task 1 — BudgetBlock (BUDGET-01/02).
 *
 * Operator-facing token-budget render block. Mounts as a sub-block inside
 * `DevApiStatusAllApisTab` alongside the actorQuality / prune blocks. Sources
 * the already-polled `tokenBudget` field from `/api/operator-status` (Plan 03,
 * GA-4 provider-keyed map) — NO new fetch (reuses the host's 30s fetchOpStatus
 * poll).
 *
 * Behavior (UI-SPEC §A):
 *   - degrade-open: renders `null` when `tokenBudget == null` (mirrors the host
 *     `opStatus?.actorQuality != null` gate). No error chrome.
 *   - per-provider proximity bar (today: only `nvidia_nim`, label `NIM`): fill
 *     width = used/cap, fill color from the semantic band (green=ok / yellow=soft
 *     / red=hard) plus TWO static threshold ticks (soft 80% + hard 95%).
 *   - cost-shadow row: `Cost today: $X.XXXX` (4dp) + `{tokensIn} in · {tokensOut}
 *     out` caption (GA-3 — today only, no sparkline, no new fetch).
 *
 * Color discipline (CLAUDE.md + UI-SPEC §Color — HARD): ONLY `accent-{blue,red,
 * green,yellow}` + the `white/N` ramp. NO entity `--color-*` tokens. No inline
 * hex/RGBA.
 */

/**
 * Client mirror of the Plan-03 server `TokenBudgetBlock` shape
 * (`server/routes/operator-status.ts`). GA-4 provider-keyed map so a restored
 * provider adds a key without breaking the consumer. Kept structurally identical
 * to the server interface — drift would surface as a render mismatch.
 */
export interface TokenBudgetBlock {
  providers: Record<
    string,
    {
      used: number;
      cap: number;
      soft: number;
      hard: number;
      state: 'ok' | 'soft' | 'hard';
    }
  >;
  costShadow: {
    tokensIn: number;
    tokensOut: number;
    usd: number;
  };
}

/** Provider key → operator-facing short label. */
const PROVIDER_LABEL: Record<string, string> = {
  nvidia_nim: 'NIM',
};

/** Semantic band fill class per budget `state` (UI-SPEC §Color outcome table). */
const BAND_FILL_CLASS: Record<'ok' | 'soft' | 'hard', string> = {
  ok: 'bg-accent-green',
  soft: 'bg-accent-yellow',
  hard: 'bg-accent-red',
};

export function BudgetBlock({ tokenBudget }: { tokenBudget: TokenBudgetBlock | null }) {
  // Phase 40 (D-06) — honest degraded render. Self-hide `return null` replaced
  // by the canonical muted placeholder so the Budget & Cost group shell always
  // has a body. Degrade-open semantics unchanged (no throw, route stays 200).
  if (tokenBudget == null) {
    return (
      <div className="text-[10px] italic text-white/30" data-testid="budget-block-placeholder">
        — no data (no budget data)
      </div>
    );
  }

  const providerEntries = Object.entries(tokenBudget.providers);

  return (
    <div data-testid="budget-block">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        TOKEN BUDGET
      </div>

      {providerEntries.length === 0 ? (
        <div className="mt-1 text-[10px] italic text-white/30" data-testid="budget-empty">
          — no data (no provider budget data yet)
        </div>
      ) : (
        <div className="mt-1 flex flex-col gap-1">
          {providerEntries.map(([provider, p]) => {
            const pct = p.cap > 0 ? Math.min(100, Math.round((p.used / p.cap) * 100)) : 0;
            const fillClass = BAND_FILL_CLASS[p.state];
            return (
              <div
                key={provider}
                className="flex items-center gap-2"
                data-testid={`budget-row-${provider}`}
              >
                <span className="w-8 shrink-0 text-[10px] text-white/60">
                  {PROVIDER_LABEL[provider] ?? provider}
                </span>
                {/* Proximity bar — h-1 track (host ProgressBar idiom) with the
                    band fill + two static threshold ticks (soft 80% / hard 95%). */}
                <div className="relative h-1 flex-1 rounded-full bg-white/10">
                  <div
                    className={`h-1 rounded-full transition-all duration-500 ${fillClass}`}
                    style={{ width: `${pct}%` }}
                    data-testid={`budget-bar-fill-${provider}`}
                  />
                  {/* soft tick @80% */}
                  <div
                    className="absolute top-0 h-1 w-px bg-white/30"
                    style={{ left: '80%' }}
                    data-testid={`budget-tick-soft-${provider}`}
                  />
                  {/* hard tick @95% */}
                  <div
                    className="absolute top-0 h-1 w-px bg-white/30"
                    style={{ left: '95%' }}
                    data-testid={`budget-tick-hard-${provider}`}
                  />
                </div>
                <span className="shrink-0 text-[8px] text-white/40 tabular-nums">
                  {p.used}/{p.cap} {p.state}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Cost-shadow row — today only (GA-3). 4dp micro-cent precision. */}
      <div className="mt-1 text-[10px] font-mono tabular-nums text-white/70">
        Cost today: ${tokenBudget.costShadow.usd.toFixed(4)}
      </div>
      <div className="text-[8px] text-white/40 tabular-nums">
        {tokenBudget.costShadow.tokensIn} in · {tokenBudget.costShadow.tokensOut} out
      </div>
    </div>
  );
}
