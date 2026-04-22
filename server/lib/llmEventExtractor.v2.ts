/**
 * Phase 27.4 v2 LLM Event Extractor (D-06..D-14, D-22).
 *
 * Shipped behind LLM_PIPELINE_V2 (Plan 01). Replaces v1's single-shot
 * extract-then-single-shot-geocode with enriched-prompt extract + 6-path
 * layered resolver (delegated to server/lib/llmResolver.ts).
 *
 * Key differences vs v1:
 *   - BATCH_SIZE = 2 (v1 = 8) per D-10
 *   - Three new prompt blocks: NEWS (D-06), BELLINGCAT (D-07), TEMPORAL (D-08)
 *   - Output schema v2: structured hierarchy + confidence + reasoning + weapon
 *     + target + timeOfDay + duration (D-11..D-14)
 *   - Geocoding delegated to server/lib/llmResolver.ts (D-22 provenance)
 *
 * Reviewer-flagged fixes baked in at first-ship:
 *   W1 — Zod-fail batches enqueue one DLQ entry per group (reason='zod_fail')
 *   W2 — bellingcat parsed coords flow through to ctx.bellingcatCoord so the
 *        resolver's bellingcat-coord-passthrough branch is reachable
 *   W3 — ctx.articleTitles carries real headlines (not URLs) to the 2-pass
 *        reranker in Plan 05
 */

import type { EventGroup } from './eventGrouping.js';
import type { LocationHierarchyV2, EnrichedEventV2, GeocodeProvenance } from './llmSchema.js';
import {
  batchResponseV2,
  EVENT_EXTRACTION_SCHEMA_V2,
  derivePrecision,
  deriveSuspect,
} from './llmSchema.js';
import { callLLM } from '../adapters/llm-provider.js';
import { resolveLocation, type ResolveContext, type ResolvedLocation } from './llmResolver.js';
import { cacheGetSafe } from '../cache/redis.js';
import { getSourceTier } from './sourceTiers.js';
import { extractBellingcatGeo } from './eventScoring.js';
import { enqueueDLQ } from './llmDLQ.js';
import { logger } from './logger.js';

const log = logger.child({ module: 'llm-extractor-v2' });

// ---------------------------------------------------------------------------
// Constants.
// ---------------------------------------------------------------------------

/** D-10 — BATCH_SIZE reduced from v1's 8 to 2 because each group now carries
 *  far more context (news + Bellingcat + temporal) and fits more comfortably
 *  into the provider's attention budget when batched narrowly. */
export const BATCH_SIZE = 2;

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
const EVENTS_LLM_V2_KEY = 'events:llm:v2';

// ---------------------------------------------------------------------------
// System prompt (D-05 verbatim, expanded for D-11..D-14).
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT_V2 = [
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

/** Result of a v2 batch extraction run — plus the per-group news / bellingcat
 *  maps that geocodeEnrichedEventsV2 needs to thread into ResolveContext. */
export interface V2ExtractionRun {
  /** null means every batch failed; empty array means no groups to process. */
  events: EnrichedEventV2[] | null;
  matchedNewsByGroup: Map<string, NewsArticleForPrompt[]>;
  bellingcatByGroup: Map<string, { lat: number; lng: number }>;
}

export interface GeocodedEnrichedEventV2 extends EnrichedEventV2 {
  resolvedLat: number;
  resolvedLng: number;
  geocodeProvenance: GeocodeProvenance;
  precision: 'exact' | 'neighborhood' | 'city' | 'region';
  suspect: boolean;
  actionGeoDistanceKm: number;
  displayName: string;
}

// ---------------------------------------------------------------------------
// Prompt builder — GDELT headers + 3 conditional enrichment blocks.
// ---------------------------------------------------------------------------

export function buildBatchUserPromptV2(contexts: PromptContext[]): string {
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
    // Always emit a Source URLs line so the prompt structure stays consistent
    // even when the group has no source URLs — prevents v1-style divergence.
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
      lines.push(
        `--- TEMPORAL CONTEXT (${temporalEvents.length} recent events in region) ---`,
      );
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
    >(EVENTS_LLM_V2_KEY, 0);
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
// Main batch processor.
//
// Returns V2ExtractionRun — NOT a plain array — so the geocoder can thread
// the per-group matched news + bellingcat maps into ResolveContext without a
// second round of Redis reads.
// ---------------------------------------------------------------------------

export async function processEventGroupsV2(
  groups: EventGroup[],
  onBatchComplete?: (completed: number, total: number) => void,
): Promise<V2ExtractionRun> {
  const matchedNewsByGroup = new Map<string, NewsArticleForPrompt[]>();
  const bellingcatByGroup = new Map<string, { lat: number; lng: number }>();

  if (groups.length === 0) {
    return { events: [], matchedNewsByGroup, bellingcatByGroup };
  }

  const results: EnrichedEventV2[] = [];
  let allFailed = true;
  const totalBatches = Math.ceil(groups.length / BATCH_SIZE);

  for (let i = 0; i < groups.length; i += BATCH_SIZE) {
    const batch = groups.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE);

    // Parallel Redis reads per group in the batch (BATCH_SIZE * 2 keys each).
    const contexts = await Promise.all(batch.map(buildPromptContext));

    // Hoist per-group news + bellingcat hits so the downstream resolver sees
    // real headlines + coord hints via the V2ExtractionRun return value.
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

    const userPrompt = buildBatchUserPromptV2(contexts);

    const content = await callLLM(
      [
        { role: 'system', content: SYSTEM_PROMPT_V2 },
        { role: 'user', content: userPrompt },
      ],
      EVENT_EXTRACTION_SCHEMA_V2,
      { batchSize: batch.length },
    );
    if (content === null) {
      log.warn({ batchIndex }, 'callLLM returned null for batch');
      onBatchComplete?.(batchIndex + 1, totalBatches);
      continue;
    }
    try {
      const parsed = JSON.parse(content);
      const validated = batchResponseV2.safeParse(parsed);
      if (!validated.success) {
        log.warn(
          { issues: validated.error.issues.slice(0, 3), batchIndex },
          'v2 Zod parse failed',
        );
        // W1 fix — surface every failed group to the DLQ so DevApiStatus can
        // count and triage them. enqueueDLQ caps lastError at 500 chars
        // internally (Plan 07 Pitfall 7).
        const errPayload = JSON.stringify(validated.error.issues.slice(0, 3));
        for (const g of batch) {
          await enqueueDLQ({
            id: g.key,
            reason: 'zod_fail',
            lastError: errPayload,
            timestamp: Date.now(),
          });
        }
        onBatchComplete?.(batchIndex + 1, totalBatches);
        continue;
      }
      results.push(...validated.data.events);
      allFailed = false;
    } catch (err) {
      log.warn({ err, batchIndex }, 'JSON.parse failed');
    }
    onBatchComplete?.(batchIndex + 1, totalBatches);
  }

  return {
    events: allFailed ? null : results,
    matchedNewsByGroup,
    bellingcatByGroup,
  };
}

// ---------------------------------------------------------------------------
// Geocoding via the layered resolver (server/lib/llmResolver.ts, D-22).
//
// Receives the per-group news + bellingcat maps so ctx.articleTitles can
// carry REAL headlines (not URLs — W3 fix) and ctx.bellingcatCoord can be
// populated from parsed Bellingcat title hints (W2 fix).
// ---------------------------------------------------------------------------

export async function geocodeEnrichedEventsV2(
  events: EnrichedEventV2[],
  groupsByKey: Map<string, EventGroup>,
  matchedNewsByGroup: Map<string, NewsArticleForPrompt[]>,
  bellingcatByGroup: Map<string, { lat: number; lng: number }>,
  onComplete?: (completed: number, total: number) => void,
): Promise<GeocodedEnrichedEventV2[]> {
  const out: GeocodedEnrichedEventV2[] = [];
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
    const resolved: ResolvedLocation = await resolveLocation(ev.location, ctx);
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
