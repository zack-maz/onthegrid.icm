/**
 * LLM Event Extractor entry point.
 *
 * Phase 29 D-02 part C collapsed the v1/v2/v3 dispatch barrel to a
 * v3-only re-export. The file is kept as a stable import path so
 * existing call sites (server/lib/llmExtractionPipeline.ts) continue to
 * resolve `processEventGroups` + `geocodeEnrichedEvents` without
 * touching their import statements. v1 + v2 extractor modules and the
 * pipeline-version helpers were removed in plans 29-04 / 29-05 / 29-06.
 */

import {
  processEventGroupsV3,
  geocodeEnrichedEventsV3,
  type GeocodedEnrichedEventV3,
  type NewsArticleForPrompt,
} from './llmEventExtractor.v3.js';

import type { EventGroup } from './eventGrouping.js';
import type { EnrichedEventV3 } from './llmSchema.js';

// Re-export v3 types so events.ts and the extraction pipeline can branch
// without a second import.
export type {
  GeocodedEnrichedEventV3,
  V3ExtractionRun,
  NewsArticleForPrompt,
} from './llmEventExtractor.v3.js';

/**
 * Tagged extractor result — `schemaVersion` discriminates the branch so
 * downstream code knows which shape to consume. Post-Phase-29 only the
 * `'v3'` arm exists; the tagged shape is kept so call sites continue to
 * compile without rewriting their branch tables.
 */
export type ExtractorRun = {
  schemaVersion: 'v3';
  events: EnrichedEventV3[] | null;
  matchedNewsByGroup: Map<string, NewsArticleForPrompt[]>;
  bellingcatByGroup: Map<string, { lat: number; lng: number }>;
};

/**
 * v3-only extractor entry point. Returns a tagged shape so downstream
 * code can branch by `schemaVersion` (only `'v3'` post-Phase-29).
 */
export async function processEventGroups(
  groups: EventGroup[],
  onBatchComplete?: (completed: number, total: number) => void | Promise<void>,
): Promise<ExtractorRun> {
  const run = await processEventGroupsV3(groups, onBatchComplete);
  return {
    schemaVersion: 'v3',
    events: run.events,
    matchedNewsByGroup: run.matchedNewsByGroup,
    bellingcatByGroup: run.bellingcatByGroup,
  };
}

/**
 * Tagged geocoder input — mirror of ExtractorRun but with a non-null
 * events array (caller already confirmed events was not null).
 */
export type GeocoderInput = {
  schemaVersion: 'v3';
  events: EnrichedEventV3[];
  matchedNewsByGroup: Map<string, NewsArticleForPrompt[]>;
  bellingcatByGroup: Map<string, { lat: number; lng: number }>;
};

export type GeocoderResult = {
  schemaVersion: 'v3';
  events: GeocodedEnrichedEventV3[];
};

/**
 * v3-only geocoder. Threads matched news + bellingcat maps into
 * geocodeEnrichedEventsV3 so ctx.articleTitles + ctx.bellingcatCoord
 * pick up tier-tagged context from the extractor run.
 */
export async function geocodeEnrichedEvents(
  input: GeocoderInput,
  groups: EventGroup[],
  onComplete?: (completed: number, total: number) => void,
): Promise<GeocoderResult> {
  const groupsByKey = new Map(groups.map((g) => [g.key, g] as const));
  const events = await geocodeEnrichedEventsV3(
    input.events,
    groupsByKey,
    input.matchedNewsByGroup,
    input.bellingcatByGroup,
    onComplete,
  );
  return { schemaVersion: 'v3', events };
}
