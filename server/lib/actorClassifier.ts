/**
 * Phase 33 Pitfall §1 mitigation — shared deterministic actor classifier.
 *
 * Same D-02 rules run in two places: the one-shot audit script (ACTOR-01)
 * AND the lazy compute in /api/operator-status (ACTOR-05, landing in Plan
 * 33-06). Drift between the two would mean dashboard counts disagree with
 * the committed audit report. Factoring out here is the smallest-blast-radius
 * dedup.
 *
 * Pure-fn module. No Redis, no logger, no I/O. Both consumers feed in the
 * CAMEO codebook (Set<string>). Mirrors the classifyByBaseCode pattern in
 * server/adapters/gdelt.ts:153-194 — module-scope constants for static maps,
 * guard-clause early returns, no per-call allocation.
 *
 * D-02 bucket coverage:
 *   (a) null / empty / whitespace-only      → 'null'
 *   (b) raw CAMEO regex ∩ committed codebook → 'raw-cameo'
 *   (c) ambiguous static deny-list          → 'ambiguous'
 *   (d) source-disagreement                 → NOT detected here
 *
 * Bucket (d) requires a second LLM pass against the live cache and is
 * reserved for human spot-check in the audit report per D-02 final clause.
 * Returning 'ok' for a clean-looking actor does NOT imply source agreement.
 */

export type ActorIssue = 'ok' | 'null' | 'raw-cameo' | 'ambiguous';

/**
 * Matches strings that look like raw CAMEO actor codes (3-6 uppercase letters,
 * e.g. USMIL (5), ISRMIL (6), IRNMIL (6)). Module-scope to avoid re-compilation
 * per call.
 *
 * DEVIATION FROM PLAN (Rule 1 bug fix): CONTEXT.md D-02 wrote `{3,5}`, but the
 * real GDELT actor codebook ships 6-character codes (e.g. ISRMIL, IRNMIL,
 * EGYMIL). PATTERNS.md's example fixture used the same 6-char codes, so the
 * `{3,5}` regex would silently fail to detect bucket (b) for any
 * country-prefix military code that uses a 3-letter country prefix. Widened
 * to `{3,6}` to match the actual codebook content. Documented in
 * 33-01-SUMMARY.md.
 *
 * NB: this regex alone is not sufficient — the matched string must ALSO be
 * present in the caller-supplied CAMEO codebook Set to qualify as bucket (b).
 * 'XYZAB' matches the shape but is not a real code; it falls through to 'ok'.
 */
const RAW_CAMEO_REGEX = /^[A-Z]{3,6}$/;

/**
 * D-02 (c) static ambiguous-generic deny-list — case-insensitive match
 * via Set<string>.has(trimmed.toLowerCase()). All entries are lowercase.
 *
 * Curated, not LLM-derived. Modifying this list is a semantic-poisoning
 * vector (T-33-02); contract enforced by the unit tests at
 * server/__tests__/lib/actorClassifier.test.ts.
 */
const AMBIGUOUS_DENY_LIST: ReadonlySet<string> = new Set([
  'soldiers',
  'forces',
  'militants',
  'troops',
  'fighters',
  'the army',
  'gunmen',
  'attackers',
  'rebels',
  'insurgents',
  'militia',
]);

/**
 * Classify a single actor string per D-02 deterministic rules.
 *
 * Guard-clause order (per gdelt.ts:153-194 analog):
 *   1. Empty/whitespace → 'null'
 *   2. Raw CAMEO shape ∩ codebook membership → 'raw-cameo'
 *   3. Lowercase deny-list hit → 'ambiguous'
 *   4. Otherwise → 'ok'
 *
 * Bucket (d) source-disagreement is NOT auto-detected — reserved for human
 * spot-check in the audit report. Returning 'ok' is a positive bucket-a/b/c
 * miss, NOT an assertion that the actor agrees with the source URL text.
 */
export function classifyActor(actor: string, cameoCodebook: ReadonlySet<string>): ActorIssue {
  const trimmed = actor.trim();
  if (trimmed.length === 0) return 'null';
  if (RAW_CAMEO_REGEX.test(trimmed) && cameoCodebook.has(trimmed)) return 'raw-cameo';
  if (AMBIGUOUS_DENY_LIST.has(trimmed.toLowerCase())) return 'ambiguous';
  return 'ok';
}

/**
 * Classify the actors array of one event. Bucket (a) covers ALL of:
 *   - null/undefined actors field on the cached event
 *   - empty array
 *   - array whose every entry is empty/whitespace
 *
 * In each of those cases this returns the singleton `['null']` so callers can
 * uniformly check `issues.includes('null')` regardless of which (a)
 * sub-case fired. For non-null arrays, the return is length-locked to the
 * input array so downstream code can index-join classifications back to the
 * source actor strings (Pitfall §1 — same shape consumed by audit script +
 * operator-status route).
 */
export function classifyEventActors(
  actors: readonly string[] | null | undefined,
  cameoCodebook: ReadonlySet<string>,
): ActorIssue[] {
  if (actors == null || actors.length === 0) return ['null'];
  if (actors.every((a) => a.trim().length === 0)) return ['null'];
  return actors.map((a) => classifyActor(a, cameoCodebook));
}
