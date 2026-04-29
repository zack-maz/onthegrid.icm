/**
 * Phase 27.4.3 v3 LLM Event Extractor (D-03).
 *
 * Mirrors v2 (server/lib/llmEventExtractor.v2.ts) with three changes:
 *   1. The llm-provider.ts cascade is replaced by freeClaudeRouter.callLLM.
 *   2. After each successfully validated batch, appendLineage() persists the
 *      prompt / response / parsed / coord / resolverPath / reasoningTrace /
 *      lineageHash to events:llm:v3:lineage:{eventId} (D-13, B-2).
 *   3. The recentEvents entry stamps reasoningTrace + lineageHash so Plan 04
 *      DrillDownRow can render them under TS strict mode.
 *
 * Cache keys bumped per D-04:
 *   events:llm:v2 → events:llm:v3
 *   events:llm:v2:partial → events:llm:v3:partial
 *
 * v1/v2 extractors remain shipped untouched (rollback safety per D-21).
 *
 * Phase 27.4.3 D-08 bake-off: set V3_BAKEOFF_MODEL=<id> to override the
 * freeClaudeRouter primary model for a single extractor run. Used during
 * multi-model evaluation; not load-bearing in production.
 */

import type { EventGroup } from './eventGrouping.js';
import type { LocationHierarchyV2, EnrichedEventV3, GeocodeProvenance } from './llmSchema.js';
import {
  batchResponseV3,
  EVENT_EXTRACTION_SCHEMA_V3,
  derivePrecision,
  deriveSuspect,
} from './llmSchema.js';
// Phase 27.4.3 D-03 — LLM call source swapped from llm-provider to
// freeClaudeRouter (NVIDIA NIM → OpenRouter cascade). Routing decisions feed
// llmProgress.routingTrace below.
import {
  callLLM as freeClaudeCallLLM,
  prewarmIfCold,
  type RoutingDecision,
} from './freeClaudeRouter.js';
// Phase 27.4.3 B-2 — lineage persistence after each per-event extract.
// Phase 27.4.4 D-18 — group-level lineage pre-filter helpers (read-side).
import {
  appendLineage,
  computeGroupLineageHash,
  GROUP_LINEAGE_KEY_PREFIX,
  GROUP_LINEAGE_TTL_SEC,
  type GroupLineageCachePayload,
} from './llmLineage.js';
import { resolveLocation, type ResolveContext, type ResolvedLocation } from './llmResolver.js';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { getSourceTier } from './sourceTiers.js';
import { extractBellingcatGeo } from './eventScoring.js';
import { enqueueDLQ } from './llmDLQ.js';
import { withBatchWatchdog } from './llmExtractorWatchdog.js';
import { updateProgress, llmProgress } from './llmProgress.js';
import type { RecentEnrichedEvent } from './llmProgress.js';
import { env, isPipelineV3, setPipelineOverride } from '../config.js';
// Phase 27.4.3 Plan 05 D-17 — auto-rollback wiring.
//   Trigger 1 (watchdog recurrence) flips the pipeline override + records an
//   audit entry from inside processEventGroupsV3 when watchdogTimeoutCount >= 3
//   in a single run.
//   Trigger 2 (eval drop) is exported as checkEvalDropTrigger so the eval
//   harness can call it after runEval persists a new score.
// B-3 fix: appendPipelineAudit is canonically defined in server/lib/pipelineAudit.ts
// (Plan 02b Task 1). routes/events.ts imports the same symbol from the same lib.
// No cyclic import (routes → lib → routes) possible.
import { appendPipelineAudit } from './pipelineAudit.js';
import { redis } from '../cache/redis.js';
import { logger } from './logger.js';

const log = logger.child({ module: 'llm-extractor-v3' });

/**
 * Phase 27.4.3 Plan 05 — Redis key for the runtime pipeline-version override
 * (mirror of server/routes/events.ts PIPELINE_OVERRIDE_KEY). Persisted alongside
 * the in-memory setPipelineOverride() write so cross-worker readers
 * (refreshPipelineOverride) see the auto-rollback flip.
 */
const PIPELINE_OVERRIDE_KEY = 'events:llm-pipeline-override';
const PIPELINE_OVERRIDE_TTL_SEC = 7 * 24 * 3600;

// ---------------------------------------------------------------------------
// Constants.
// ---------------------------------------------------------------------------

/** D-10 — BATCH_SIZE reduced from v1's 8 to 2 because each group now carries
 *  far more context (news + Bellingcat + temporal) and fits more comfortably
 *  into the provider's attention budget when batched narrowly. */
export const BATCH_SIZE = 2;

/** Phase 27.4.3 D-08 bake-off — empty/undefined uses freeClaudeRouter's
 *  NVIDIA_NIM_DEFAULT_MODEL. Set V3_BAKEOFF_MODEL=<id> in env to swap the
 *  primary model for a single extractor run during multi-model evaluation. */
const V3_BAKEOFF_MODEL = process.env.V3_BAKEOFF_MODEL;

/** RESEARCH.md A5 — cap temporal block at 3 prior events to avoid prompt bloat. */
const TEMPORAL_CONTEXT_COUNT = 3;
/** ±1 degree bbox around the event group centroid (≈111 km × cos(lat)). */
const TEMPORAL_CONTEXT_BBOX_DEG = 1;
/** ±72h window for temporal context events. */
const TEMPORAL_CONTEXT_WINDOW_MS = 72 * 3_600_000;
/** RESEARCH.md Open Q A4 — ±24h window for news match (no haversine, only time). */
const NEWS_MATCH_WINDOW_MS = 24 * 3_600_000;
/** Redis keys read by the context builder. */
const NEWS_KEY = 'news:gdelt';
/**
 * Terminal cache of ConflictEventEntity[] — written by server/routes/events.ts
 * after geocoding completes. Read here only for the TEMPORAL CONTEXT BLOCK
 * (±72h + ±1deg bbox of prior enriched events). Phase 27.4.3 D-04: bumped
 * to v3 cache keys; v2 keys preserved for the rollback path.
 */
const EVENTS_LLM_V3_KEY = 'events:llm:v3';
/**
 * Partial-progress cache for the v3 extractor — written per-batch from
 * writePartialCache. Holds LLMCachePayload<EnrichedEventV3> envelopes so
 * DevApiStatus / /llm-status can show in-flight progress without colliding
 * with the terminal ConflictEventEntity[] key above. Readers of the main
 * /api/events endpoint NEVER touch this key.
 */
const EVENTS_LLM_V3_PARTIAL_KEY = 'events:llm:v3:partial';
export { EVENTS_LLM_V3_KEY, EVENTS_LLM_V3_PARTIAL_KEY };

// ---------------------------------------------------------------------------
// System prompt (D-05 verbatim, expanded for D-11..D-14, v3 D-10 schema-in-prompt).
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT_V3 = [
  'You are a conflict event analyst extracting structured data from GDELT event records.',
  '',
  'For each event group, extract (all fields REQUIRED unless stated nullable):',
  '1. location: A structured place hierarchy — each field NULLABLE when the source text does not support it:',
  '   - country: full English name (e.g., "Iran", "Iraq") or null',
  '   - admin1: province / state / governorate name or null',
  '   - city: city or town name or null',
  '   - neighborhood: neighborhood / district / suburb name or null',
  '   - landmark: specific facility / site name (e.g., "Natanz nuclear facility") or null',
  '   - confidence: number between 0 and 1 indicating how confident you are in this location',
  '2. type: one of "airstrike", "on_ground", "explosion", "targeted", "other"',
  '3. confidence: number between 0 and 1 for overall extraction confidence',
  '4. reasoning: <=200 characters — cite which signals led to the location pick (news source, Bellingcat, GDELT metadata, etc.)',
  '5. weaponType: one of "airstrike","drone","missile","artillery","small_arms","IED", or null if not stated',
  '6. targetType: one of "military","infrastructure","civilian","leadership", or null if not stated',
  '7. timeOfDay: UTC HH:MM (e.g., "03:15") if the source mentions a specific strike time, else null',
  '8. durationMinutes: non-negative integer if the source mentions duration, else null',
  '9. actors: array of actor names involved',
  '10. severity: "critical" | "high" | "medium" | "low"',
  '11. summary: 2-3 sentence description of what happened',
  '12. casualties: { killed: integer | null, injured: integer | null, unknown: boolean }',
  '13. sourceCount: integer — count of independent sources',
  '',
  'Hard rules:',
  '- NEVER emit coordinates (lat/lng). Only output place names.',
  '- NEVER emit a "precision" field — the server derives it from which hierarchy fields you populated.',
  '- Use null when a field is not supported by the source text — do NOT guess.',
  '- Prefer the NEWS BLOCK and BELLINGCAT BLOCK when present; they are higher-tier signals than GDELT metadata alone.',
  '- The TEMPORAL BLOCK lists prior events in the same region — use it to normalize names (e.g., "the Jobar substation").',
  '',
  'JSON Schema (this is the contract — your output MUST validate):',
  JSON.stringify(EVENT_EXTRACTION_SCHEMA_V3, null, 2),
  '',
  '- Output ONLY the JSON object. Any reasoning must go in the "reasoning" field, not in <think> blocks (those are stripped).',
].join('\n');

// ---------------------------------------------------------------------------
// Types used internally + exported for tests.
// ---------------------------------------------------------------------------

/** Minimal article shape used in the NEWS BLOCK and threaded through to the
 *  resolver as ctx.articleTitles. `publishedAt` is Unix ms (NewsArticle shape). */
export interface NewsArticleForPrompt {
  title: string;
  url: string;
  sourceCountry?: string;
  publishedAt: number;
}

export interface PriorEnrichedEventForPrompt {
  summary: string;
  location: LocationHierarchyV2;
  timestamp: number;
}

export interface PromptContext {
  group: EventGroup;
  matchedNews: NewsArticleForPrompt[];
  bellingcatHits: Array<{ title: string; lat: number; lng: number }>;
  temporalEvents: PriorEnrichedEventForPrompt[];
}

/** Result of a v3 batch extraction run — plus the per-group news / bellingcat
 *  maps that geocodeEnrichedEventsV3 needs to thread into ResolveContext.
 *  EnrichedEventV3 extends EnrichedEventV2 with `schemaVersion: 'v3'`. */
export interface V3ExtractionRun {
  /** null means every batch failed; empty array means no groups to process. */
  events: EnrichedEventV3[] | null;
  matchedNewsByGroup: Map<string, NewsArticleForPrompt[]>;
  bellingcatByGroup: Map<string, { lat: number; lng: number }>;
}

export interface GeocodedEnrichedEventV3 extends EnrichedEventV3 {
  resolvedLat: number;
  resolvedLng: number;
  geocodeProvenance: GeocodeProvenance;
  precision: 'exact' | 'neighborhood' | 'city' | 'region';
  suspect: boolean;
  actionGeoDistanceKm: number;
  displayName: string;
}

/**
 * Phase 27.4.3 D-04 — cache envelope for `events:llm:v3:partial`.
 *
 * Wraps the events array with progress metadata so readers (DevApiStatus /
 * /llm-status) can distinguish a partial snapshot (mid-run) from a final
 * snapshot (complete=true). Mirrors the v2 envelope verbatim; the user-
 * facing /api/events reader NEVER touches this key — it reads
 * `events:llm:v3` (the terminal ConflictEventEntity[] key written by the
 * route after geocoding completes).
 */
export interface LLMCachePayload {
  events: EnrichedEventV3[];
  progress: `${number}/${number}`;
  complete: boolean;
  generatedAt: string;
}

/** Phase 27.4.1 D-07 — Redis hard TTL for the partial/final cache snapshot.
 *  Must match the LLM_REDIS_TTL_SEC used in server/routes/events.ts so the
 *  partial writes don't expire out of band with the caller's expectations. */
const LLM_REDIS_TTL_SEC = 9000;

// ---------------------------------------------------------------------------
// Prompt builder — GDELT headers + 3 conditional enrichment blocks.
// ---------------------------------------------------------------------------

export function buildBatchUserPromptV3(contexts: PromptContext[]): string {
  const lines: string[] = ['Analyze these GDELT event groups and extract structured data:\n'];

  for (let i = 0; i < contexts.length; i++) {
    const ctx = contexts[i];
    if (!ctx) continue; // noUncheckedIndexedAccess guard — unreachable in practice
    const { group, matchedNews, bellingcatHits, temporalEvents } = ctx;
    const e = group.entities[0];
    lines.push(`--- Event Group ${i + 1} (key: ${group.key}) ---`);
    lines.push(`Date: ${new Date(group.timestamp).toISOString().slice(0, 10)}`);
    lines.push(`CAMEO Code: ${group.primaryCameo}`);
    lines.push(`Location (GDELT ActionGeo): ${e?.data.locationName ?? 'unknown'}`);
    lines.push(`Actors: ${e?.data.actor1 ?? '?'} vs ${e?.data.actor2 ?? '?'}`);
    lines.push(`Goldstein Scale: ${e?.data.goldsteinScale ?? 'n/a'}`);
    lines.push(`Total Mentions: ${group.totalMentions}, Total Sources: ${group.totalSources}`);
    lines.push(`Rows in group: ${group.entities.length}`);
    if (group.sourceUrls.length > 0) {
      lines.push(`Source URLs: ${group.sourceUrls.slice(0, 3).join(', ')}`);
    } else {
      lines.push('Source URLs: (none)');
    }

    // D-06 NEWS BLOCK — omitted entirely when no matches (avoid wasting tokens).
    if (matchedNews.length > 0) {
      lines.push('');
      lines.push('--- NEWS BLOCK (tier-tagged) ---');
      for (const art of matchedNews.slice(0, 5)) {
        const tier = getSourceTier('', hostnameOf(art.url));
        const tag = tier === 1 ? 'T1' : tier === 2 ? 'T2' : 'T3';
        lines.push(`[${tag}] ${art.title.slice(0, 160)}`);
      }
    }

    // D-07 BELLINGCAT BLOCK — high-trust OSINT with coord hints.
    if (bellingcatHits.length > 0) {
      lines.push('');
      lines.push('--- BELLINGCAT OSINT (high-trust) ---');
      for (const b of bellingcatHits.slice(0, 3)) {
        lines.push(
          `${b.title.slice(0, 160)} [Bellingcat coord hint: ${b.lat.toFixed(2)}, ${b.lng.toFixed(2)}]`,
        );
      }
    }

    // D-08 TEMPORAL BLOCK — up to 3 prior events in the same region/window.
    if (temporalEvents.length > 0) {
      lines.push('');
      lines.push(`--- TEMPORAL CONTEXT (${temporalEvents.length} recent events in region) ---`);
      for (const t of temporalEvents) {
        const locStr =
          [t.location.landmark, t.location.neighborhood, t.location.city]
            .filter(Boolean)
            .join(', ') ||
          t.location.country ||
          'unknown';
        const ago = `${Math.round((group.timestamp - t.timestamp) / 3_600_000)}h ago`;
        lines.push(`- ${locStr} (${ago}): ${t.summary.slice(0, 120)}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Context builders — read Redis caches to assemble the 3 enrichment blocks.
//
// RESEARCH.md Open Q A4: news match is time-only (±24h) + optional country
// filter. NOT haversine — news articles don't carry lat/lng in our cache.
// ---------------------------------------------------------------------------

async function buildPromptContext(group: EventGroup): Promise<PromptContext> {
  const matchedNews: NewsArticleForPrompt[] = [];
  const bellingcatHits: Array<{ title: string; lat: number; lng: number }> = [];

  try {
    const news = await cacheGetSafe<
      Array<{
        articles: Array<{
          title: string;
          url: string;
          publishedAt: number; // NewsArticle stores Unix ms, not ISO string
          sourceCountry?: string;
        }>;
      }>
    >(NEWS_KEY, 0);
    if (news?.data) {
      for (const cluster of news.data) {
        for (const art of cluster.articles ?? []) {
          const pubMs = typeof art.publishedAt === 'number' ? art.publishedAt : NaN;
          if (!Number.isFinite(pubMs)) continue;
          if (Math.abs(pubMs - group.timestamp) > NEWS_MATCH_WINDOW_MS) continue;
          matchedNews.push({
            title: art.title,
            url: art.url,
            sourceCountry: art.sourceCountry,
            publishedAt: pubMs,
          });
          // D-07 — ride on the news read to opportunistically parse Bellingcat
          // coord hints from the title. Decoupled from domain filtering so a
          // Bellingcat-attributed article quoted by Reuters still contributes.
          const geo = extractBellingcatGeo(art.title);
          if (geo) bellingcatHits.push({ title: art.title, lat: geo.lat, lng: geo.lng });
        }
      }
    }
  } catch (err) {
    log.warn({ err }, 'news cross-match failed, omitting NEWS+BELLINGCAT blocks');
  }

  const temporalEvents = await loadTemporalContext(group);

  return { group, matchedNews, bellingcatHits, temporalEvents };
}

async function loadTemporalContext(group: EventGroup): Promise<PriorEnrichedEventForPrompt[]> {
  try {
    const cached = await cacheGetSafe<
      Array<{
        timestamp?: number;
        lat?: number;
        lng?: number;
        data?: { summary?: string; location?: LocationHierarchyV2 };
      }>
    >(EVENTS_LLM_V3_KEY, 0);
    if (!cached?.data) return [];
    const out: PriorEnrichedEventForPrompt[] = [];
    for (const e of cached.data) {
      if (!e.data?.location || !e.data?.summary || !e.timestamp) continue;
      if (Math.abs(group.timestamp - e.timestamp) > TEMPORAL_CONTEXT_WINDOW_MS) continue;
      if (typeof e.lat === 'number' && typeof e.lng === 'number') {
        if (Math.abs(e.lat - group.centroidLat) > TEMPORAL_CONTEXT_BBOX_DEG) continue;
        if (Math.abs(e.lng - group.centroidLng) > TEMPORAL_CONTEXT_BBOX_DEG) continue;
      }
      out.push({
        summary: e.data.summary,
        location: e.data.location,
        timestamp: e.timestamp,
      });
      if (out.length >= TEMPORAL_CONTEXT_COUNT) break;
    }
    return out;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Per-batch partial cache writer (D-04 — observability key, never user-facing).
// ---------------------------------------------------------------------------

/**
 * Phase 27.4.3 D-04 — write a partial/final snapshot of the in-progress events
 * array to `events:llm:v3:partial`, a key RESERVED FOR OBSERVABILITY. The
 * terminal /api/events reader never touches this key — it reads
 * `events:llm:v3` which is only ever written by the route-level geocode-then-
 * write step (server/routes/events.ts) with the correct ConflictEventEntity[]
 * shape.
 *
 * Why two keys: LLMCachePayload carries EnrichedEventV3[] (pre-geocode shape).
 * Splitting the keys makes the progress/observability vs user-facing-cache
 * boundary explicit (mirrors v2 27.4.1 post-ship discipline).
 *
 * Wrapped in cacheSetSafe so Redis failures don't propagate (D-29).
 * `complete: true` is written exactly once, after the last batch of
 * the run.
 */
async function writePartialCache(
  events: EnrichedEventV3[],
  completed: number,
  total: number,
  complete: boolean,
): Promise<void> {
  const payload: LLMCachePayload = {
    events,
    progress: `${completed}/${total}`,
    complete,
    generatedAt: new Date().toISOString(),
  };
  try {
    await cacheSetSafe(EVENTS_LLM_V3_PARTIAL_KEY, payload, LLM_REDIS_TTL_SEC);
  } catch (err) {
    // cacheSetSafe already swallows internally, but belt+suspenders.
    log.warn({ err, completed, total, complete }, 'partial cache write failed');
  }
}

// ---------------------------------------------------------------------------
// Main batch processor.
//
// Returns V3ExtractionRun — NOT a plain array — so the geocoder can thread
// the per-group matched news + bellingcat maps into ResolveContext without a
// second round of Redis reads.
// ---------------------------------------------------------------------------

export async function processEventGroupsV3(
  groups: EventGroup[],
  onBatchComplete?: (completed: number, total: number) => void,
): Promise<V3ExtractionRun> {
  const matchedNewsByGroup = new Map<string, NewsArticleForPrompt[]>();
  const bellingcatByGroup = new Map<string, { lat: number; lng: number }>();

  if (groups.length === 0) {
    return { events: [], matchedNewsByGroup, bellingcatByGroup };
  }

  // Phase 27.4.4 D-04 — mirror env.V3_ADAPTIVE_BATCH onto the live progress
  // singleton so DevApiStatus's adaptive-batch cell renders the active state
  // even when splitCount is 0 (i.e. no batches have timed out yet this run).
  updateProgress({ adaptiveBatchEnabled: env.V3_ADAPTIVE_BATCH });

  // Phase 27.4.4 D-18 — mirror env.V3_LINEAGE_PREFILTER + seed the counters
  // before the pre-filter loop so DevApiStatus's lineage-prefilter cell can
  // render even when no groups passed through (default-OFF state).
  updateProgress({ lineagePrefilterEnabled: env.V3_LINEAGE_PREFILTER });

  // Phase 27.4.4 D-21 — fire a 1-token synthetic NIM warmup if the in-memory
  // lastNimCallTs indicates the client has gone cold (>60s idle). Best-effort;
  // the helper swallows errors so a cold-NIM run never aborts here.
  await prewarmIfCold();

  const results: EnrichedEventV3[] = [];
  let allFailed = true;

  // Phase 27.4.4 D-18 — group-level lineage pre-filter. When enabled, every
  // group gets a stable hash (key + sorted(sourceUrls) + totalMentions) and
  // the read-side cache at GROUP_LINEAGE_KEY_PREFIX + hash is consulted. On
  // hit AND age < GROUP_LINEAGE_TTL_SEC, the cached EnrichedEventV3 is pushed
  // straight to results and the group is dropped from the LLM-call queue.
  // On miss, age expiry, malformed payload, or Redis read failure, the group
  // falls through unchanged. The WRITE-side is OUT OF SCOPE for 27.4.4 (a
  // future phase wires `redis.setex(GROUP_LINEAGE_KEY_PREFIX + hash, ...)`
  // after each successful batch — see Plan 02 Gate B follow-ups).
  let groupsToProcess: EventGroup[] = groups;
  if (env.V3_LINEAGE_PREFILTER) {
    const stats = llmProgress.lineagePrefilterStats ?? { hitCount: 0, missCount: 0 };
    const queue: EventGroup[] = [];
    const nowMs = Date.now();
    const ttlMs = GROUP_LINEAGE_TTL_SEC * 1000;

    for (const group of groups) {
      const hash = computeGroupLineageHash({
        key: group.key,
        sourceUrls: group.sourceUrls,
        totalMentions: group.totalMentions,
      });
      const cacheKey = `${GROUP_LINEAGE_KEY_PREFIX}${hash}`;
      let cached: GroupLineageCachePayload | null = null;
      try {
        const raw = await redis.get(cacheKey);
        if (raw != null) {
          // Upstash REST sometimes parses JSON-shaped values; normalise to an object.
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (
            parsed &&
            typeof parsed === 'object' &&
            'event' in (parsed as Record<string, unknown>) &&
            'ts' in (parsed as Record<string, unknown>)
          ) {
            cached = parsed as GroupLineageCachePayload;
          }
        }
      } catch (readErr) {
        log.warn(
          {
            cacheKey,
            err: readErr instanceof Error ? readErr.message : String(readErr),
          },
          'lineage pre-filter read failed; falling through',
        );
      }

      const fresh = cached && typeof cached.ts === 'number' && nowMs - cached.ts < ttlMs;
      if (fresh && cached) {
        // Hit AND fresh — re-validate through the v3 batch schema before
        // trusting an opaque cache payload. A future writer that drifts the
        // schema must not crash the live extractor; the safeParse failure
        // path treats it as a miss.
        const reparse = batchResponseV3.safeParse({ events: [cached.event] });
        if (reparse.success && reparse.data.events[0]) {
          results.push(reparse.data.events[0]);
          allFailed = false;
          stats.hitCount += 1;
          continue;
        }
        log.warn(
          { cacheKey },
          'lineage pre-filter cache payload failed v3 reparse; treating as miss',
        );
      }
      stats.missCount += 1;
      queue.push(group);
    }

    updateProgress({ lineagePrefilterStats: stats });
    groupsToProcess = queue;
  }

  const totalBatches = Math.ceil(groupsToProcess.length / BATCH_SIZE);

  for (let i = 0; i < groupsToProcess.length; i += BATCH_SIZE) {
    const batch = groupsToProcess.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE);

    // Parallel Redis reads per group in the batch (BATCH_SIZE * 2 keys each).
    const contexts = await Promise.all(batch.map(buildPromptContext));

    // Hoist per-group news + bellingcat hits so the downstream resolver sees
    // real headlines + coord hints via the V3ExtractionRun return value.
    for (const ctx of contexts) {
      matchedNewsByGroup.set(ctx.group.key, ctx.matchedNews);
      const firstBellingcat = ctx.bellingcatHits[0];
      if (firstBellingcat) {
        bellingcatByGroup.set(ctx.group.key, {
          lat: firstBellingcat.lat,
          lng: firstBellingcat.lng,
        });
      }
    }

    const userPrompt = buildBatchUserPromptV3(contexts);

    // Phase 27.4.3 D-03 — wrap the freeClaudeRouter.callLLM invocation with
    // the shared watchdog (D-11/D-12 27.4.1 — symmetric reuse non-negotiable
    // so the rollback path stays reliable). On timeout each group in the
    // batch is DLQ-routed with reason='v3:timeout_watchdog'. Routing
    // decisions are captured into `routing` (closure) and threaded into
    // llmProgress.routingTrace below.
    let routing: RoutingDecision[] = [];
    let didTimeout = false; // Phase 27.4.4 D-04 — flag for adaptive split-retry handoff.
    let finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null = null;
    const t0 = Date.now();
    const content = await withBatchWatchdog(
      async () => {
        const result = await freeClaudeCallLLM(
          [
            { role: 'system', content: SYSTEM_PROMPT_V3 },
            { role: 'user', content: userPrompt },
          ],
          JSON.stringify(EVENT_EXTRACTION_SCHEMA_V3),
          { batchSize: batch.length, modelOverride: V3_BAKEOFF_MODEL },
        );
        routing = result.routing;
        // Phase 27.4.4 Plan 02 dev-pass: thread finish_reason so the JSON.parse
        // catch block can tag truncations distinctly from generic malformed JSON.
        finishReason = result.finishReason ?? null;
        // freeClaudeRouter's stripReasoningBlocks already removed <think>
        // blocks; we don't see the raw text from here. Lineage records
        // reasoningTrace as empty for v3 unless a future router enhancement
        // surfaces the raw response (acceptable per D-13 "if present").
        return result.content;
      },
      {
        timeoutMs: env.LLM_BATCH_TIMEOUT_MS,
        softWarnMs: 60_000, // D-02 hard-coded — only hard cap is env-tunable
        batchIndex,
        label: 'v3',
        onTimeout: async () => {
          didTimeout = true;
          // Phase 27.4.4 D-04 — when adaptive batching is enabled AND the
          // batch has > 1 group, defer DLQ enqueue + watchdogTimeoutCount
          // increment to the splitBatchOnTimeout helper called below. The
          // helper enqueues v3:adaptive-retry-fail per failed half-group
          // and never increments watchdogTimeoutCount (Test 6 invariant —
          // a successful split-retry must NOT trigger D-13 auto-rollback).
          if (env.V3_ADAPTIVE_BATCH && batch.length > 1) return;

          // Phase 27.4.3 — DLQ-route each group; enqueueDLQ is try/catch
          // internally (D-29) so these awaits never throw out of the fire-
          // and-forget block.
          for (const g of batch) {
            await enqueueDLQ({
              id: g.key,
              reason: 'v3:timeout_watchdog',
              lastError: `v3 batch ${batchIndex} exceeded ${env.LLM_BATCH_TIMEOUT_MS}ms`,
              timestamp: Date.now(),
            });
          }
          updateProgress({
            watchdogTimeoutCount: (llmProgress.watchdogTimeoutCount ?? 0) + 1,
          });
        },
        onSoftWarn: (elapsedMs) => {
          // Append a synthetic soft-warn entry to callHistory so DevApiStatus
          // shows an amber marker. Field-set must match the LLMPipelineProgress
          // callHistory element type exactly (durationMs, ok, batchSize,
          // timestamp). Provider 'nvidia_nim' = the v3 primary.
          const history = llmProgress.callHistory ?? [];
          updateProgress({
            callHistory: [
              {
                provider: 'nvidia_nim' as const,
                model: 'watchdog-soft-warn',
                tokensIn: 0,
                tokensOut: 0,
                durationMs: elapsedMs,
                ok: true,
                batchSize: batch.length,
                timestamp: Date.now(),
                skipReason: 'watchdog-soft-warn' as const,
              },
              ...history,
            ].slice(0, 20),
          });
        },
      },
    );

    // Persist this batch's routing decisions into the per-pipeline trace.
    if (routing.length) {
      const prevTrace = llmProgress.routingTrace ?? [];
      const newEntries = routing.map((r) => ({
        ts: r.timestamp,
        batch: batchIndex,
        provider: r.provider,
        model: r.model,
        reason: r.reason,
      }));
      updateProgress({ routingTrace: [...newEntries, ...prevTrace].slice(0, 50) });
    }

    if (content === null) {
      // Phase 27.4.4 D-04 — adaptive split-and-retry handoff. When the
      // watchdog fired AND env.V3_ADAPTIVE_BATCH is on AND the batch had
      // more than one group, splitBatchOnTimeout retries each half once
      // at smaller size. Successful halves contribute their events back
      // into `results`; failed halves DLQ-route as v3:adaptive-retry-fail.
      // splitCount + retrySuccess + retryFail + dlqEnqueueCount counters
      // tick inside the helper.
      if (didTimeout && env.V3_ADAPTIVE_BATCH && batch.length > 1) {
        const stats = llmProgress.adaptiveBatchStats ?? {
          splitCount: 0,
          retrySuccess: 0,
          retryFail: 0,
          dlqEnqueueCount: 0,
        };
        stats.splitCount += 1;
        updateProgress({ adaptiveBatchStats: stats });

        const splitEvents = await splitBatchOnTimeout(contexts, batchIndex);
        results.push(...splitEvents);
        if (splitEvents.length > 0) allFailed = false;
        onBatchComplete?.(batchIndex + 1, totalBatches);
        await writePartialCache(results, batchIndex + 1, totalBatches, false);
        continue;
      }
      // Either freeClaudeCallLLM returned null OR the watchdog fired. Both
      // paths already logged / DLQ'd / updated telemetry; just continue.
      log.warn({ batchIndex }, 'v3 batch yielded no content (null or watchdog timeout)');
      onBatchComplete?.(batchIndex + 1, totalBatches);
      await writePartialCache(results, batchIndex + 1, totalBatches, false);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (jsonErr) {
      // Phase 27.4.4 Plan 02 dev-pass: distinguish max_tokens truncation from
      // generic malformed JSON. finishReason='length' is the authoritative
      // signal; 'Unterminated string' substring is a heuristic fallback for
      // providers that don't surface finish_reason. When either matches,
      // tag the DLQ entries as v3:max_tokens_truncation so the dashboard
      // can surface "bump the cap" vs. "model is hallucinating" distinctly.
      const errMsg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
      const isTruncation = finishReason === 'length' || /unterminated string/i.test(errMsg);
      const dlqReason = isTruncation ? 'v3:max_tokens_truncation' : 'v3:malformed';
      log.warn(
        {
          batchIndex,
          jsonErr: errMsg,
          finishReason,
          dlqReason,
        },
        'v3 JSON.parse failed',
      );
      for (const g of batch) {
        await enqueueDLQ({
          id: g.key,
          reason: dlqReason,
          lastError: `JSON.parse failed (finishReason=${finishReason ?? 'unknown'}): ${errMsg.slice(0, 200)}`,
          timestamp: Date.now(),
        });
      }
      const sf = llmProgress.schemaFailures ?? {
        nvidia_nim: { total: 0, malformedJson: 0, missingField: 0, typeMismatch: 0 },
        openrouter: { total: 0, malformedJson: 0, missingField: 0, typeMismatch: 0 },
      };
      const primary = routing[0]?.provider ?? 'nvidia_nim';
      sf[primary].total += 1;
      sf[primary].malformedJson += 1;
      updateProgress({ schemaFailures: sf });
      onBatchComplete?.(batchIndex + 1, totalBatches);
      await writePartialCache(results, batchIndex + 1, totalBatches, false);
      continue;
    }

    const validated = batchResponseV3.safeParse(parsed);
    if (!validated.success) {
      log.warn({ issues: validated.error.issues.slice(0, 3), batchIndex }, 'v3 Zod parse failed');
      const errPayload = JSON.stringify(validated.error.issues.slice(0, 3));
      for (const g of batch) {
        await enqueueDLQ({
          id: g.key,
          reason: 'v3:schema_fail',
          lastError: errPayload,
          timestamp: Date.now(),
        });
      }
      const sf = llmProgress.schemaFailures ?? {
        nvidia_nim: { total: 0, malformedJson: 0, missingField: 0, typeMismatch: 0 },
        openrouter: { total: 0, malformedJson: 0, missingField: 0, typeMismatch: 0 },
      };
      const primary = routing[0]?.provider ?? 'nvidia_nim';
      sf[primary].total += 1;
      sf[primary].missingField += 1;
      updateProgress({ schemaFailures: sf });
      onBatchComplete?.(batchIndex + 1, totalBatches);
      await writePartialCache(results, batchIndex + 1, totalBatches, false);
      continue;
    }

    results.push(...validated.data.events);
    allFailed = false;

    // === B-2 D-13 lineage capture per event in the validated batch ===
    // Stamp lineage hash + reasoningTrace onto recentEvents so Plan 04
    // DrillDownRow can render them under TS strict mode. Per-event resolve
    // happens later in geocodeEnrichedEventsV3 — at that point the coord and
    // resolver path are unknown. We capture lineage at extract-time with
    // placeholder coord (0,0) + 'gdelt-actiongeo-fallback' provenance; the
    // geocoder updates the full resolved coord on the cache entry, but
    // lineage records the LLM's structured-extraction lineage which is
    // complete here.
    const promptText = `${SYSTEM_PROMPT_V3}\n\n${userPrompt}`;
    const reasoningTrace = '';
    const model = routing[0]?.model ?? 'unknown';
    const batchDurationMs = Date.now() - t0;
    for (const enrichedEvt of validated.data.events) {
      const eventId = `llm-v3-${enrichedEvt.groupKey}`;
      const { lineageHash } = await appendLineage(eventId, {
        prompt: promptText,
        response: content,
        parsed: enrichedEvt,
        coord: { lat: 0, lng: 0 }, // resolver fills in coord on the entity; lineage records pre-resolve LLM output
        provenance: 'gdelt-actiongeo-fallback',
        resolverPath: 'pre-resolve',
        reasoningTrace,
        model,
      });

      const recentEvent: RecentEnrichedEvent = {
        groupKey: enrichedEvt.groupKey,
        location: {
          country: enrichedEvt.location.country,
          admin1: enrichedEvt.location.admin1,
          city: enrichedEvt.location.city,
          neighborhood: enrichedEvt.location.neighborhood,
          landmark: enrichedEvt.location.landmark,
        },
        precision: derivePrecision(enrichedEvt.location),
        confidence: enrichedEvt.confidence,
        reasoning: enrichedEvt.reasoning,
        weaponType: enrichedEvt.weaponType,
        targetType: enrichedEvt.targetType,
        tokensIn: null,
        tokensOut: null,
        provenance: 'gdelt-actiongeo-fallback',
        sources: [],
        fetchedAt: Date.now(),
        reasoningTrace,
        lineageHash,
      };
      const recents = (llmProgress.recentEvents ?? []).slice(0, 49);
      updateProgress({ recentEvents: [recentEvent, ...recents] });
    }

    // Soft observability — wall-time per batch surfaces in the log even when
    // freeClaudeRouter's per-attempt latency capture is the canonical signal.
    log.debug(
      { batchIndex, durationMs: batchDurationMs, events: validated.data.events.length },
      'v3 batch processed',
    );

    onBatchComplete?.(batchIndex + 1, totalBatches);
    await writePartialCache(results, batchIndex + 1, totalBatches, false);
  }

  // Final write with complete=true so readers can distinguish mid-run partial
  // from a terminated-run final.
  await writePartialCache(results, totalBatches, totalBatches, true);

  // ===========================================================================
  // Phase 27.4.3 Plan 05 D-17 Trigger 1 — watchdog-recurrence auto-rollback.
  //
  // After the batch loop completes, if the watchdog killed >= 3 batches in
  // this single run AND v3 is the active pipeline, flip the runtime override
  // back to v2 + record a D-15 audit entry with trigger 'auto:watchdog_recurrence'.
  // The 3-batch threshold (per CONTEXT D-17) requires recurrence — a single
  // watchdog timeout is treated as a transient incident, not a rollback signal.
  // The check is skipped when v3 is not active so a v2 / v1 run cannot
  // accidentally flip the override.
  // ===========================================================================
  await checkWatchdogRecurrenceTrigger();

  return {
    events: allFailed ? null : results,
    matchedNewsByGroup,
    bellingcatByGroup,
  };
}

// ---------------------------------------------------------------------------
// Phase 27.4.4 D-04 — splitBatchOnTimeout helper.
//
// When the watchdog fires on a batch with > 1 group AND env.V3_ADAPTIVE_BATCH
// is true, the main loop hands off to this helper instead of DLQ-routing the
// whole batch. The helper splits the contexts into two halves and retries
// each half once at the smaller size. Per-half outcomes:
//   - Success → events parsed and returned (contribute to retrySuccess counter).
//   - Watchdog timeout / null content / JSON.parse fail / Zod fail →
//     DLQ-enqueue each group in the half with reason 'v3:adaptive-retry-fail'
//     (retryFail + dlqEnqueueCount counters tick).
//
// The helper never recurses — a half that times out is final. This bounds the
// adaptive-retry budget to one extra LLM call per timed-out batch (still well
// inside the per-call timeout envelope).
//
// Why a separate helper rather than inline retry: callable in isolation from
// unit tests, keeps the main batch loop's control flow readable, and isolates
// the watchdog-wrapping pattern from the parsing pipeline.
// ---------------------------------------------------------------------------

async function splitBatchOnTimeout(
  contexts: PromptContext[],
  batchIndex: number,
): Promise<EnrichedEventV3[]> {
  const mid = Math.ceil(contexts.length / 2);
  const halves: PromptContext[][] = [contexts.slice(0, mid), contexts.slice(mid)];
  const successes: EnrichedEventV3[] = [];

  const enqueueAdaptiveFails = async (half: PromptContext[], lastError: string): Promise<void> => {
    for (const ctx of half) {
      await enqueueDLQ({
        id: ctx.group.key,
        reason: 'v3:adaptive-retry-fail',
        lastError,
        timestamp: Date.now(),
      });
    }
    const stats = llmProgress.adaptiveBatchStats ?? {
      splitCount: 0,
      retrySuccess: 0,
      retryFail: 0,
      dlqEnqueueCount: 0,
    };
    stats.retryFail += half.length;
    stats.dlqEnqueueCount += half.length;
    updateProgress({ adaptiveBatchStats: stats });
  };

  for (const half of halves) {
    if (half.length === 0) continue;

    const halfPrompt = buildBatchUserPromptV3(half);
    let halfTimedOut = false;

    const halfContent = await withBatchWatchdog(
      async () => {
        const r = await freeClaudeCallLLM(
          [
            { role: 'system', content: SYSTEM_PROMPT_V3 },
            { role: 'user', content: halfPrompt },
          ],
          JSON.stringify(EVENT_EXTRACTION_SCHEMA_V3),
          { batchSize: half.length, modelOverride: V3_BAKEOFF_MODEL },
        );
        return r.content;
      },
      {
        timeoutMs: env.LLM_BATCH_TIMEOUT_MS,
        softWarnMs: 60_000,
        batchIndex,
        label: 'v3-split',
        onTimeout: async () => {
          halfTimedOut = true;
        },
      },
    );

    if (halfContent === null) {
      await enqueueAdaptiveFails(
        half,
        halfTimedOut
          ? `v3 split-retry timed out (batch ${batchIndex})`
          : 'v3 split-retry returned null content',
      );
      continue;
    }

    let halfParsed: unknown;
    try {
      halfParsed = JSON.parse(halfContent);
    } catch (parseErr) {
      await enqueueAdaptiveFails(
        half,
        `v3 split-retry JSON.parse: ${parseErr instanceof Error ? parseErr.message.slice(0, 200) : 'unknown'}`,
      );
      continue;
    }

    const halfValidated = batchResponseV3.safeParse(halfParsed);
    if (!halfValidated.success) {
      await enqueueAdaptiveFails(
        half,
        `v3 split-retry Zod fail: ${JSON.stringify(halfValidated.error.issues.slice(0, 2))}`,
      );
      continue;
    }

    successes.push(...halfValidated.data.events);
    const stats = llmProgress.adaptiveBatchStats ?? {
      splitCount: 0,
      retrySuccess: 0,
      retryFail: 0,
      dlqEnqueueCount: 0,
    };
    stats.retrySuccess += half.length;
    updateProgress({ adaptiveBatchStats: stats });
  }

  return successes;
}

// ---------------------------------------------------------------------------
// Phase 27.4.3 Plan 05 D-17 — auto-rollback ladder.
//
// Two triggers, both flip override v3 -> v2 and record a D-15 audit entry:
//   1. checkWatchdogRecurrenceTrigger — called from inside processEventGroupsV3
//      after the batch loop completes. Reads llmProgress.watchdogTimeoutCount.
//   2. checkEvalDropTrigger — called from llmEvalHarness.runEval after a new
//      baseline is persisted. Compares against events:llm-eval-baseline:v3.
//
// Both are exported for unit-test access and idempotent: they are no-ops
// when v3 is not the active pipeline (so a v2 / v1 run cannot flip override).
// All Redis writes are best-effort; persistence failures are logged but do
// not unwind the in-memory flip.
// ---------------------------------------------------------------------------

/**
 * Internal helper: persist override to Redis + append D-15 audit entry.
 * Used by both auto-rollback triggers so the audit-log shape stays consistent.
 */
async function performAutoRollbackToV2(opts: {
  trigger: 'auto:watchdog_recurrence' | 'auto:eval_drop';
  reason: string;
}): Promise<void> {
  const fromVersion = 'v3' as const;
  setPipelineOverride('v2');
  try {
    await redis.set(PIPELINE_OVERRIDE_KEY, 'v2', { ex: PIPELINE_OVERRIDE_TTL_SEC });
  } catch (err) {
    log.warn({ err }, 'failed to persist auto-rollback override to redis');
  }
  await appendPipelineAudit({
    ts: Date.now(),
    from: fromVersion,
    to: 'v2',
    trigger: opts.trigger,
    operator: process.env.NODE_ENV === 'production' ? 'production' : 'cron',
    reason: opts.reason,
  });
}

/**
 * D-17 Trigger 1: watchdog-recurrence auto-rollback. Called at the end of
 * processEventGroupsV3 (one detection per run, not per batch). Flips v3 -> v2
 * + records audit when llmProgress.watchdogTimeoutCount >= 3 AND v3 is active.
 *
 * Returns whether a rollback fired (for unit tests + caller introspection).
 */
export async function checkWatchdogRecurrenceTrigger(): Promise<{
  rolledBack: boolean;
  reason?: string;
}> {
  if (!isPipelineV3()) return { rolledBack: false };
  const wdCount = llmProgress.watchdogTimeoutCount ?? 0;
  // Phase 27.4.4 D-13 — threshold is env-tunable. Default 2 (Zod schema in
  // server/config.ts) keeps Gate B's strict watchdog=0 baseline while letting
  // single timeouts recover without spurious flip; ops can raise it without
  // a redeploy via V3_WATCHDOG_ROLLBACK_THRESHOLD=N.
  const threshold = env.V3_WATCHDOG_ROLLBACK_THRESHOLD;
  if (wdCount < threshold) return { rolledBack: false };
  log.warn(
    { watchdogTimeoutCount: wdCount, threshold },
    'D-17 Trigger 1: watchdog recurrence — auto-rollback v3 -> v2',
  );
  const reason = `watchdogTimeoutCount=${wdCount} (>= ${threshold})`;
  await performAutoRollbackToV2({ trigger: 'auto:watchdog_recurrence', reason });
  return { rolledBack: true, reason };
}

/**
 * D-17 Trigger 2: eval-drop auto-rollback. Called by llmEvalHarness.runEval
 * after persisting a new score; compares against the cutover-gate baseline at
 * `events:llm-eval-baseline:v3`. If the new within20km/total ratio drops
 * >= 5pp from baseline AND v3 is the active pipeline, flips override -> v2.
 *
 * Read note: the baseline is persisted by llmEvalHarness via cacheSetSafe(),
 * which wraps the score in a `CacheEntry<T>` envelope `{data: EvalScore,
 * fetchedAt: number}`. We unwrap that envelope here. The original Plan 05
 * literal text used `redis.get<{within20km, total}>(...)` which would have
 * read the envelope as the score — Rule 1 bug fix: unwrap the .data field.
 * Defense-in-depth handles all observed envelope shapes (envelope, raw object,
 * legacy JSON string, null, malformed) so a future shape drift degrades to
 * "no rollback" instead of crashing the eval harness.
 */
export async function checkEvalDropTrigger(opts: {
  newWithin20kmRatio: number;
}): Promise<{ rolledBack: boolean; reason?: string }> {
  if (!isPipelineV3()) return { rolledBack: false };
  try {
    const raw = await redis.get<unknown>('events:llm-eval-baseline:v3');
    if (!raw) return { rolledBack: false };

    // Unwrap CacheEntry<T> envelope when present, accept raw object as fallback,
    // accept legacy JSON-string entries from non-cacheSetSafe writers.
    let baselineScore: { within20km?: unknown; total?: unknown } | null = null;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const inner = (parsed as { data?: Record<string, unknown> }).data ?? parsed;
        baselineScore = inner as { within20km?: unknown; total?: unknown };
      } catch {
        return { rolledBack: false };
      }
    } else if (raw && typeof raw === 'object') {
      const env = raw as { data?: unknown; within20km?: unknown; total?: unknown };
      const inner = (env.data ?? env) as { within20km?: unknown; total?: unknown };
      baselineScore = inner;
    }

    if (
      !baselineScore ||
      typeof baselineScore.within20km !== 'number' ||
      typeof baselineScore.total !== 'number' ||
      baselineScore.total === 0
    ) {
      return { rolledBack: false };
    }
    const baselineRatio = baselineScore.within20km / baselineScore.total;
    const drop = baselineRatio - opts.newWithin20kmRatio;
    if (drop >= 0.05) {
      log.warn(
        { drop, baselineRatio, newRatio: opts.newWithin20kmRatio },
        'D-17 Trigger 2: eval drop >= 5pp — auto-rollback v3 -> v2',
      );
      const reason = `eval drop ${drop.toFixed(3)} (baseline ${baselineRatio.toFixed(3)} -> ${opts.newWithin20kmRatio.toFixed(3)})`;
      await performAutoRollbackToV2({ trigger: 'auto:eval_drop', reason });
      return { rolledBack: true, reason };
    }
  } catch (err) {
    log.warn({ err }, 'eval-drop trigger check failed (redis unreachable?)');
  }
  return { rolledBack: false };
}

// ---------------------------------------------------------------------------
// Geocoding via the layered resolver (server/lib/llmResolver.ts, D-22).
//
// Receives the per-group news + bellingcat maps so ctx.articleTitles can
// carry REAL headlines (not URLs — W3 fix) and ctx.bellingcatCoord can be
// populated from parsed Bellingcat title hints (W2 fix).
// ---------------------------------------------------------------------------

export async function geocodeEnrichedEventsV3(
  events: EnrichedEventV3[],
  groupsByKey: Map<string, EventGroup>,
  matchedNewsByGroup: Map<string, NewsArticleForPrompt[]>,
  bellingcatByGroup: Map<string, { lat: number; lng: number }>,
  onComplete?: (completed: number, total: number) => void,
): Promise<GeocodedEnrichedEventV3[]> {
  const out: GeocodedEnrichedEventV3[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev) continue; // noUncheckedIndexedAccess guard — unreachable in practice
    const group = groupsByKey.get(ev.groupKey);
    const matchedNews = matchedNewsByGroup.get(ev.groupKey) ?? [];
    const ctx: ResolveContext = {
      centroidLat: group?.centroidLat ?? 0,
      centroidLng: group?.centroidLng ?? 0,
      // W3 fix — article TITLES, not URLs.
      articleTitles: matchedNews.slice(0, 3).map((a) => a.title),
      summary: ev.summary,
      // W2 fix — bellingcat coord flows through when parse hit in the news
      // read; null when nothing matched (the resolver's branch 5 falls through
      // naturally on null).
      bellingcatCoord: bellingcatByGroup.get(ev.groupKey) ?? null,
    };
    // Phase 27.4.4 Plan 02 dev-pass — per-event try/catch so a single
    // resolveLocation failure (timeout, throw, anything unexpected) doesn't
    // freeze the entire 392-event geocoding loop. On error, we use the GDELT
    // ActionGeo centroid as the fallback coord and tag provenance accordingly
    // — same shape as Branch 6 of the resolver, just reached defensively.
    let resolved: ResolvedLocation;
    try {
      resolved = await resolveLocation(ev.location, ctx);
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err), groupKey: ev.groupKey },
        'resolveLocation threw — using GDELT centroid fallback for this event',
      );
      resolved = {
        lat: ctx.centroidLat,
        lng: ctx.centroidLng,
        provenance: 'gdelt-actiongeo-fallback',
        actionGeoDistanceKm: 0,
        displayName: 'GDELT ActionGeo centroid (resolver error fallback)',
      };
    }
    const precision = derivePrecision(ev.location);

    // Tier classification for suspect derivation — getSourceTier returns
    // 1|2|3|null; we map the number to gold/silver/bronze and drop nulls so
    // an unknown-tier source doesn't pollute the SuspectInput array (the
    // deriveSuspect all-bronze rule would otherwise misfire when every
    // source is actually "unknown").
    const sourceHostnames = (group?.sourceUrls ?? []).map((u) => hostnameOf(u));
    const tiers: Array<'gold' | 'silver' | 'bronze'> = [];
    for (const h of sourceHostnames) {
      const t = getSourceTier('', h);
      if (t === 1) tiers.push('gold');
      else if (t === 2) tiers.push('silver');
      else if (t === 3) tiers.push('bronze');
    }

    const suspect = deriveSuspect({
      confidence: ev.confidence,
      precision,
      actionGeoDistanceKm: resolved.actionGeoDistanceKm,
      tiers,
    });

    out.push({
      ...ev,
      resolvedLat: resolved.lat,
      resolvedLng: resolved.lng,
      geocodeProvenance: resolved.provenance,
      precision,
      suspect,
      actionGeoDistanceKm: resolved.actionGeoDistanceKm,
      displayName: resolved.displayName,
    });
    onComplete?.(i + 1, events.length);
  }
  return out;
}
