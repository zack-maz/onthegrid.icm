/**
 * LLM Event Extractor entry point.
 *
 * Phase 27.4 Plan 06: Routes between v1 and v2 extractors based on
 * isPipelineV2() (D-24, W4 single-source-of-truth helper) read at call
 * time so operators can flip LLM_PIPELINE_V2 without a rebuild.
 *
 * Phase 27.4.3 Plan 02b: extended to v3 via getPipelineVersion(). Three-way
 * dispatch returns a discriminated union — the compiler enforces correct
 * downstream branching.
 *
 * Re-exports v1 types for backward compatibility with pre-27.4 consumers.
 * v2/v3 consumers should import from the version-specific module directly
 * when they need access to version-only shapes (GeocodedEnrichedEventV2/3, etc.).
 *
 * v1 is preserved under .v1.ts per D-26 as the rollback path; v2 is
 * preserved per D-21 (Phase 27.4.3) for the same purpose.
 */

import type { EventGroup } from './eventGrouping.js';
import * as v1 from './llmEventExtractor.v1.js';
import {
  processEventGroupsV2,
  geocodeEnrichedEventsV2,
  type NewsArticleForPrompt,
  type GeocodedEnrichedEventV2,
} from './llmEventExtractor.v2.js';
import {
  processEventGroupsV3,
  geocodeEnrichedEventsV3,
  type GeocodedEnrichedEventV3,
} from './llmEventExtractor.v3.js';
import type { EnrichedEventV2, EnrichedEventV3 } from './llmSchema.js';
import { getPipelineVersion } from '../config.js';

// Re-export v1 types for pre-27.4 consumers that import types directly.
export type { EnrichedEvent } from './llmEventExtractor.v1.js';
// Re-export v2 types so events.ts can branch without a second import.
export type {
  NewsArticleForPrompt,
  GeocodedEnrichedEventV2,
  V2ExtractionRun,
} from './llmEventExtractor.v2.js';
// Re-export v3 types so events.ts and Plan 04 dashboards can branch.
export type { GeocodedEnrichedEventV3, V3ExtractionRun } from './llmEventExtractor.v3.js';

/**
 * Tagged extractor result — `schemaVersion` discriminates the branch so
 * downstream code knows which shape to consume.
 *
 * v2/v3 additionally carry `matchedNewsByGroup` + `bellingcatByGroup` which
 * the geocoder needs to populate ResolveContext.articleTitles (W3) and
 * ResolveContext.bellingcatCoord (W2).
 */
export type ExtractorRun =
  | { schemaVersion: 'v1'; events: v1.EnrichedEvent[] | null }
  | {
      schemaVersion: 'v2';
      events: EnrichedEventV2[] | null;
      matchedNewsByGroup: Map<string, NewsArticleForPrompt[]>;
      bellingcatByGroup: Map<string, { lat: number; lng: number }>;
    }
  | {
      schemaVersion: 'v3';
      events: EnrichedEventV3[] | null;
      matchedNewsByGroup: Map<string, NewsArticleForPrompt[]>;
      bellingcatByGroup: Map<string, { lat: number; lng: number }>;
    };

/**
 * Flag-routed extractor entry point.
 *
 * Reads getPipelineVersion() so callers don't need to know which pipeline
 * is active. Returns a tagged union so downstream code must branch — the
 * compiler keeps the three shapes honest.
 */
export async function processEventGroups(
  groups: EventGroup[],
  onBatchComplete?: (completed: number, total: number) => void,
): Promise<ExtractorRun> {
  const version = getPipelineVersion();
  if (version === 'v3') {
    const run = await processEventGroupsV3(groups, onBatchComplete);
    return {
      schemaVersion: 'v3',
      events: run.events,
      matchedNewsByGroup: run.matchedNewsByGroup,
      bellingcatByGroup: run.bellingcatByGroup,
    };
  }
  if (version === 'v2') {
    const run = await processEventGroupsV2(groups, onBatchComplete);
    return {
      schemaVersion: 'v2',
      events: run.events,
      matchedNewsByGroup: run.matchedNewsByGroup,
      bellingcatByGroup: run.bellingcatByGroup,
    };
  }
  const events = await v1.processEventGroups(groups, onBatchComplete);
  return { schemaVersion: 'v1', events };
}

/**
 * Tagged geocoder input — mirror of ExtractorRun but with a non-null
 * events array (caller already confirmed events was not null).
 */
export type GeocoderInput =
  | { schemaVersion: 'v1'; events: v1.EnrichedEvent[] }
  | {
      schemaVersion: 'v2';
      events: EnrichedEventV2[];
      matchedNewsByGroup: Map<string, NewsArticleForPrompt[]>;
      bellingcatByGroup: Map<string, { lat: number; lng: number }>;
    }
  | {
      schemaVersion: 'v3';
      events: EnrichedEventV3[];
      matchedNewsByGroup: Map<string, NewsArticleForPrompt[]>;
      bellingcatByGroup: Map<string, { lat: number; lng: number }>;
    };

export type GeocoderResult =
  | {
      schemaVersion: 'v1';
      events: Array<v1.EnrichedEvent & { resolvedLat: number; resolvedLng: number }>;
    }
  | { schemaVersion: 'v2'; events: GeocodedEnrichedEventV2[] }
  | { schemaVersion: 'v3'; events: GeocodedEnrichedEventV3[] };

/**
 * Flag-routed geocoder. W2/W3 fixes: v2/v3 branches thread matched news +
 * bellingcat maps into geocodeEnrichedEventsV2/3 so ctx.articleTitles = real
 * headlines and ctx.bellingcatCoord is populated when a Bellingcat-tier
 * article's title carried parseable coordinates.
 */
export async function geocodeEnrichedEvents(
  input: GeocoderInput,
  groups: EventGroup[],
  onComplete?: (completed: number, total: number) => void,
): Promise<GeocoderResult> {
  if (input.schemaVersion === 'v3') {
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
  if (input.schemaVersion === 'v2') {
    const groupsByKey = new Map(groups.map((g) => [g.key, g] as const));
    const events = await geocodeEnrichedEventsV2(
      input.events,
      groupsByKey,
      input.matchedNewsByGroup,
      input.bellingcatByGroup,
      onComplete,
    );
    return { schemaVersion: 'v2', events };
  }
  const events = await v1.geocodeEnrichedEvents(input.events, groups, onComplete);
  return { schemaVersion: 'v1', events };
}
