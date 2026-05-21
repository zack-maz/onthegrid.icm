#!/usr/bin/env node
/**
 * Phase 33 Plan 01 Task 3 (D-01..D-03) — one-shot audit of events:llm:v3
 * actor metadata.
 *
 * Reads the live LLM-extracted event cache and classifies each event's
 * data.actors[] per the D-02 deterministic rules (buckets a/b/c). Bucket d
 * (source-disagreement) is reserved for human spot-check; this script seeds
 * 10 random candidates from the a/b/c overlap for the operator to mark
 * with [✓ disagrees] / [✗ matches source] annotations after running.
 *
 * Output: .planning/phases/33-actor-.../33-AUDIT-REPORT.md (committed).
 *
 * Usage:
 *   node --import tsx/esm .planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/audit/run-audit.ts [--prod-confirm]
 *
 *   --prod-confirm   Required when env.CACHE_KEY_PREFIX is empty (production
 *                    tier) — defense-in-depth gate mirrors snapshot-v3-redis.
 *                    Dev runs (CACHE_KEY_PREFIX=dev:) auto-pass.
 *
 * Pre-conditions:
 *   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env vars set.
 *   - CACHE_KEY_PREFIX matches the tier you want to audit (empty=prod, dev:=dev).
 *   - .planning/phases/33-actor-.../cameo-codes.json present (graceful degradation
 *     if absent: empty codebook is used and bucket-b counts will be zero
 *     until Plan 33-02 commits the codebook).
 *
 * Dedup contract: this script imports classifyEventActors from
 * server/lib/actorClassifier so the SAME D-02 rules drive both the
 * audit report AND Plan 33-06's /api/operator-status lazy-compute.
 * Pitfall §1 honored.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cacheGetSafe } from '../../../../server/cache/redis.js';
import { classifyEventActors } from '../../../../server/lib/actorClassifier.js';

import type { ConflictEventEntity } from '../../../../server/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHASE_DIR = resolve(__dirname, '..');
const REPORT_PATH = resolve(PHASE_DIR, '33-AUDIT-REPORT.md');
const CODEBOOK_PATH = resolve(PHASE_DIR, 'cameo-codes.json');

interface CameoCodebookEntry {
  code: string;
  label?: string;
  type?: string;
}

interface CameoCodebookFile {
  version?: string;
  source?: string;
  actorCodes?: CameoCodebookEntry[];
}

interface BucketExample {
  eventId: string;
  actors: readonly string[];
  source: string;
}

const MAX_EXAMPLES_PER_BUCKET = 10;
const BUCKET_D_SEED_COUNT = 10;

/**
 * Load the committed CAMEO actor codebook. Returns an empty Set when the
 * file is absent (Plan 33-01 ships first; the codebook lands in Plan 33-02).
 * In that degraded mode bucket-b detection becomes a no-op until the
 * codebook commit lands.
 */
function loadCodebook(): { codes: Set<string>; degraded: boolean } {
  if (!existsSync(CODEBOOK_PATH)) {
    console.error(
      `warn: ${CODEBOOK_PATH} not found — Plan 33-02 commits the codebook. ` +
        'Running in degraded mode: bucket (b) counts will be 0 until codebook lands.',
    );
    return { codes: new Set<string>(), degraded: true };
  }
  const raw = readFileSync(CODEBOOK_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as CameoCodebookFile;
  const codes = new Set<string>(
    (parsed.actorCodes ?? []).map((entry) => entry.code).filter((c): c is string => Boolean(c)),
  );
  return { codes, degraded: false };
}

/**
 * Fisher-Yates shuffle (mutates a copy). Used to randomize the bucket-d
 * spot-check candidate selection so the report doesn't always pick the
 * first 10 a/b/c-overlap entries.
 */
function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    const swap = out[j];
    if (tmp === undefined || swap === undefined) continue;
    out[i] = swap;
    out[j] = tmp;
  }
  return out;
}

function pct(n: number, total: number): string {
  if (total === 0) return '0.00%';
  return `${((n * 100) / total).toFixed(2)}%`;
}

function escapeMd(s: string): string {
  // Escape pipes so we don't break embedded markdown tables / inline-code.
  return s.replace(/\|/g, '\\|');
}

function renderExamples(examples: readonly BucketExample[]): string {
  if (examples.length === 0) return '_no examples_\n';
  return examples
    .slice(0, MAX_EXAMPLES_PER_BUCKET)
    .map(
      (ex) =>
        `- **${escapeMd(ex.eventId)}** — actors: \`${escapeMd(JSON.stringify(ex.actors))}\`${
          ex.source ? ` — source: <${escapeMd(ex.source)}>` : ''
        }`,
    )
    .join('\n');
}

function renderBucketDSpotCheck(candidates: readonly BucketExample[]): string {
  if (candidates.length === 0) return '_no a/b/c overlap candidates available for seeding_\n';
  return candidates
    .slice(0, BUCKET_D_SEED_COUNT)
    .map(
      (ex) =>
        `- [ ] **${escapeMd(ex.eventId)}** — actors: \`${escapeMd(JSON.stringify(ex.actors))}\`${
          ex.source ? ` — source: <${escapeMd(ex.source)}>` : ''
        }  _Mark \`[✓ disagrees]\` / \`[✗ matches source]\` after review_`,
    )
    .join('\n');
}

function renderReport(opts: {
  totalEvents: number;
  buckets: {
    null: BucketExample[];
    'raw-cameo': BucketExample[];
    ambiguous: BucketExample[];
  };
  bucketDSeed: BucketExample[];
  codebookDegraded: boolean;
  capturedAt: string;
  cacheKeyPrefix: string;
}): string {
  const { totalEvents, buckets, bucketDSeed, codebookDegraded, capturedAt, cacheKeyPrefix } = opts;
  const nullCount = buckets.null.length;
  const rawCameoCount = buckets['raw-cameo'].length;
  const ambiguousCount = buckets.ambiguous.length;

  return `# Phase 33 Actor Metadata Audit Report

**Captured:** ${capturedAt}
**Cache tier:** ${cacheKeyPrefix || '(prod)'}
**Total events scanned:** ${totalEvents}
${
  codebookDegraded
    ? '\n> ⚠️ Running in **degraded mode** — `cameo-codes.json` not found. Bucket (b) counts will be 0 until Plan 33-02 commits the codebook.\n'
    : ''
}

## Per-bucket counts

| Bucket | Description | Count | % of total |
| ------ | ----------- | ----- | ---------- |
| (a) null/empty | actors null, missing, or all-whitespace | ${nullCount} | ${pct(nullCount, totalEvents)} |
| (b) raw CAMEO | regex \`/^[A-Z]{3,6}$/\` ∩ committed CAMEO codebook | ${rawCameoCount} | ${pct(rawCameoCount, totalEvents)} |
| (c) ambiguous | static deny-list (\`soldiers\`, \`forces\`, \`militants\`, \`troops\`, \`fighters\`, \`the army\`, \`gunmen\`, \`attackers\`, \`rebels\`, \`insurgents\`, \`militia\`) | ${ambiguousCount} | ${pct(ambiguousCount, totalEvents)} |
| (d) source-disagreement | NOT auto-detected — see spot-check section below | — | — |

## Bucket (a) — null/empty actors

${renderExamples(buckets.null)}

## Bucket (b) — raw CAMEO actor codes

${renderExamples(buckets['raw-cameo'])}

## Bucket (c) — ambiguous generic actors

${renderExamples(buckets.ambiguous)}

## Bucket (d) — source-disagreement (HUMAN SPOT-CHECK)

Reserved for operator review per D-02 final clause. The 10 seeds below are
randomly sampled from the a/b/c overlap. Mark each \`[✓ disagrees]\` (the
extracted actors disagree with the source URL) or \`[✗ matches source]\`
(the extracted actors agree with the source URL) inline.

${renderBucketDSpotCheck(bucketDSeed)}

## Next actions

1. Operator commits this report alongside annotations (see bucket-d checklist
   above). Plan 33-02 reads the bucket-a/b/c findings to seed
   \`server/data/actor-catalog.ts\`.
2. Plan 33-05's ground-truth backfill targets the ≥30 of 50 events identified
   here as needing \`expectedActor1\` / \`expectedActor2\` enrichment.
3. Plan 33-06's \`/api/operator-status\` lazy-compute uses the SAME
   \`classifyEventActors\` (Pitfall §1) so the dashboard counts mirror this
   committed report.
`;
}

async function main(): Promise<void> {
  // --- prod-confirm gate (mirrors snapshot-v3-redis.ts:135-141; T-33-01) ---
  const cacheKeyPrefix = process.env.CACHE_KEY_PREFIX ?? '';
  const prodConfirm = process.argv.includes('--prod-confirm');
  if (!cacheKeyPrefix && !prodConfirm) {
    console.error(
      'error: env.CACHE_KEY_PREFIX is empty (production tier) — re-run with --prod-confirm to acknowledge',
    );
    process.exit(2);
  }

  // --- read events:llm:v3 via the production cacheGetSafe path ---
  // 999_999_999 logical TTL = "never stale" (we just want the latest entry).
  // Matches the existing read pattern in llmExtractionPipeline.ts:219.
  const cached = await cacheGetSafe<ConflictEventEntity[]>('events:llm:v3', 999_999_999);
  if (!cached || !Array.isArray(cached.data)) {
    console.error('error: events:llm:v3 cache empty or malformed — nothing to audit');
    process.exit(1);
    return;
  }
  const events = cached.data;

  // --- load codebook (graceful: empty Set when Plan 33-02 hasn't landed) ---
  const { codes: codebook, degraded: codebookDegraded } = loadCodebook();

  // --- classify each event ---
  const buckets = {
    null: [] as BucketExample[],
    'raw-cameo': [] as BucketExample[],
    ambiguous: [] as BucketExample[],
  };

  for (const event of events) {
    const actors = event.data?.actors ?? null;
    const issues = classifyEventActors(actors, codebook);
    const example: BucketExample = {
      eventId: event.id,
      actors: actors ?? [],
      source: event.data?.source ?? '',
    };
    if (issues.includes('null')) buckets.null.push(example);
    if (issues.includes('raw-cameo')) buckets['raw-cameo'].push(example);
    if (issues.includes('ambiguous')) buckets.ambiguous.push(example);
  }

  // --- seed bucket-d spot-check: 10 random candidates from a/b/c overlap ---
  // "Overlap" = events that appear in MORE THAN ONE of a/b/c (the most likely
  // candidates for source-disagreement: if multiple deterministic buckets
  // fire on the same event, the extracted actors are probably wrong).
  const overlapById = new Map<string, BucketExample>();
  const seenInBucket: Record<string, Set<string>> = {
    null: new Set(),
    'raw-cameo': new Set(),
    ambiguous: new Set(),
  };
  for (const ex of buckets.null) seenInBucket.null!.add(ex.eventId);
  for (const ex of buckets['raw-cameo']) seenInBucket['raw-cameo']!.add(ex.eventId);
  for (const ex of buckets.ambiguous) seenInBucket.ambiguous!.add(ex.eventId);
  for (const ex of [...buckets.null, ...buckets['raw-cameo'], ...buckets.ambiguous]) {
    const hitCount =
      Number(seenInBucket.null!.has(ex.eventId)) +
      Number(seenInBucket['raw-cameo']!.has(ex.eventId)) +
      Number(seenInBucket.ambiguous!.has(ex.eventId));
    if (hitCount > 1) overlapById.set(ex.eventId, ex);
  }
  // Fallback: if there's no multi-bucket overlap, seed from the union (any
  // a/b/c-classified event) so the operator still has 10 spot-check
  // candidates to review.
  const overlapCandidates = Array.from(overlapById.values());
  const seedPool =
    overlapCandidates.length >= BUCKET_D_SEED_COUNT
      ? overlapCandidates
      : Array.from(
          new Map(
            [...buckets.null, ...buckets['raw-cameo'], ...buckets.ambiguous].map((ex) => [
              ex.eventId,
              ex,
            ]),
          ).values(),
        );
  const bucketDSeed = shuffle(seedPool).slice(0, BUCKET_D_SEED_COUNT);

  // --- render + write report ---
  const md = renderReport({
    totalEvents: events.length,
    buckets,
    bucketDSeed,
    codebookDegraded,
    capturedAt: new Date().toISOString(),
    cacheKeyPrefix,
  });
  writeFileSync(REPORT_PATH, md, 'utf-8');

  console.log(
    JSON.stringify(
      {
        report: REPORT_PATH.replace(`${process.cwd()}/`, ''),
        totalEvents: events.length,
        buckets: {
          null: buckets.null.length,
          'raw-cameo': buckets['raw-cameo'].length,
          ambiguous: buckets.ambiguous.length,
        },
        bucketDSeedCount: bucketDSeed.length,
        codebookDegraded,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error('audit failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
