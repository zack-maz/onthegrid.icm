/**
 * Phase 27.4 Layered Geocoding Resolver (D-22).
 *
 * Six paths in strict priority order (D-22):
 *   1. own-site-snapshot
 *   2. poi-amenity-nominatim       - Plan 05 (D-03): forwardGeocodeConstrained({amenity}) + country filter + cache
 *   3. nominatim-direct            - Plan 05: forwardGeocodeConstrained (ME viewbox + 22 country codes) + cache
 *   4. nominatim-verified-2pass    - Plan 05 (D-04): sanity-gated LLM reranker (top-5 candidates)
 *   5. bellingcat-coord-passthrough
 *   6. gdelt-actiongeo-fallback
 */

import { z } from 'zod';
import { forwardGeocodeConstrained } from '../adapters/nominatim.js';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { callLLM } from '../adapters/llm-provider.js';
import { loadSitesSnapshot } from './sitesSnapshot.js';
import { loadWaterSnapshot } from './waterSnapshot.js';
import { logger } from './logger.js';
import { ME_VIEWBOX, ME_COUNTRY_CODES } from './meBounds.js';
import {
  derivePrecision,
  type GeocodeProvenance,
  type LocationHierarchyV2,
} from './llmSchema.js';

const log = logger.child({ module: 'llm-resolver' });

// Cache + throttle
const GEOCODE_CACHE_PREFIX = 'geocode:fwd:constrained:';
const GEOCODE_CACHE_LOGICAL_TTL_MS = 30 * 24 * 3600 * 1000;
const GEOCODE_CACHE_REDIS_TTL_SEC = 30 * 24 * 3600;
const GEOCODE_DELAY_MS = 1000;
let lastNominatimCallMs = 0;

async function throttleNominatim(): Promise<void> {
  const elapsed = Date.now() - lastNominatimCallMs;
  if (elapsed < GEOCODE_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, GEOCODE_DELAY_MS - elapsed));
  }
  lastNominatimCallMs = Date.now();
}

/**
 * Test-only: reset the module-level throttle timestamp so tests don't
 * accumulate wait time between invocations. Safe to call from test setup;
 * no-op in production.
 */
export function __resetThrottleForTests(): void {
  lastNominatimCallMs = 0;
}

function cacheKey(
  kind: 'poi' | 'direct' | 'verify',
  parts: Record<string, string | undefined>,
): string {
  const ordered = Object.keys(parts)
    .sort()
    .filter((k) => parts[k] !== undefined)
    .map((k) => `${k}=${parts[k]}`)
    .join('|');
  return `${GEOCODE_CACHE_PREFIX}${kind}:${ordered}`;
}

export interface ResolveContext {
  centroidLat: number;
  centroidLng: number;
  bellingcatCoord?: { lat: number; lng: number } | null;
  articleTitles?: string[];
  summary?: string;
}

export interface ResolvedLocation {
  lat: number;
  lng: number;
  provenance: GeocodeProvenance;
  actionGeoDistanceKm: number;
  displayName: string;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const POI_KEYWORDS: readonly string[] = [
  'nuclear', 'airbase', 'air base', 'naval base', 'naval', 'airport', 'airfield',
  'port', 'port of', 'military base', 'military complex', 'garrison', 'barracks',
  'dam', 'reservoir', 'refinery', 'power plant', 'power station', 'pipeline',
  'oil terminal', 'substation',
] as const;

export function isPoiLandmark(landmark: string | null): boolean {
  if (!landmark) return false;
  const lower = landmark.toLowerCase();
  return POI_KEYWORDS.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, 'i').test(lower);
  });
}

const POI_AMENITY_MAP: Record<string, string> = {
  nuclear: 'nuclear power plant',
  airbase: 'military airbase',
  'air base': 'military airbase',
  'naval base': 'naval base',
  naval: 'naval base',
  airport: 'airport',
  airfield: 'airfield',
  'port of': 'port',
  port: 'port',
  'military base': 'military base',
  'military complex': 'military base',
  garrison: 'military base',
  barracks: 'barracks',
  dam: 'dam',
  reservoir: 'reservoir',
  refinery: 'oil refinery',
  'power plant': 'power plant',
  'power station': 'power plant',
  pipeline: 'pipeline',
  'oil terminal': 'oil terminal',
  substation: 'substation',
};

function inferAmenity(landmark: string): string | null {
  const lower = landmark.toLowerCase();
  const keywords = Object.keys(POI_AMENITY_MAP).sort((a, b) => b.length - a.length);
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, 'i');
    if (regex.test(lower)) return POI_AMENITY_MAP[kw]!;
  }
  return null;
}

export function fuzzyNameMatch(landmark: string, snapshotLabel: string): boolean {
  const a = landmark.trim().toLowerCase();
  const b = snapshotLabel.trim().toLowerCase();
  if (a.length < 3) return false;
  return b.includes(a) || a.includes(b);
}

function countryMatches(
  snapshotCountry: string | null | undefined,
  hierarchyCountry: string | null,
): boolean {
  if (!hierarchyCountry) return true;
  if (!snapshotCountry) return false;
  return snapshotCountry.toLowerCase() === hierarchyCountry.toLowerCase();
}

function countryCodeFromName(country: string | null): string | undefined {
  if (!country) return undefined;
  const map: Record<string, string> = {
    iran: 'ir', iraq: 'iq', syria: 'sy', lebanon: 'lb', israel: 'il',
    palestine: 'ps', jordan: 'jo', egypt: 'eg',
    'saudi arabia': 'sa', uae: 'ae', 'united arab emirates': 'ae',
    bahrain: 'bh', kuwait: 'kw', oman: 'om', qatar: 'qa', yemen: 'ye',
    turkey: 'tr', afghanistan: 'af', pakistan: 'pk', turkmenistan: 'tm',
    azerbaijan: 'az', armenia: 'am', georgia: 'ge',
  };
  return map[country.toLowerCase()];
}

interface SnapshotHit {
  lat: number;
  lng: number;
  displayName: string;
}

function resolveFromSnapshot(hierarchy: LocationHierarchyV2): SnapshotHit | null {
  if (!hierarchy.landmark) return null;
  const sites = loadSitesSnapshot();
  if (sites?.sites) {
    for (const site of sites.sites) {
      const s = site as { country?: string; label?: string; lat?: number; lng?: number };
      if (!countryMatches(s.country ?? null, hierarchy.country)) continue;
      const label = s.label ?? '';
      if (fuzzyNameMatch(hierarchy.landmark, label)) {
        return { lat: s.lat as number, lng: s.lng as number, displayName: label };
      }
    }
  }
  const water = loadWaterSnapshot();
  if (water?.facilities) {
    for (const f of water.facilities) {
      const w = f as { country?: string; label?: string; lat?: number; lng?: number };
      if (!countryMatches(w.country ?? null, hierarchy.country)) continue;
      const label = w.label ?? '';
      if (fuzzyNameMatch(hierarchy.landmark, label)) {
        return { lat: w.lat as number, lng: w.lng as number, displayName: label };
      }
    }
  }
  return null;
}

async function resolveViaPoiAmenity(hierarchy: LocationHierarchyV2): Promise<SnapshotHit | null> {
  if (!hierarchy.landmark) return null;
  const amenity = inferAmenity(hierarchy.landmark);
  if (!amenity) return null;
  const cc = countryCodeFromName(hierarchy.country);
  const key = cacheKey('poi', { amenity, country: cc, landmark: hierarchy.landmark });
  const cached = await cacheGetSafe<SnapshotHit | { miss: true }>(
    key,
    GEOCODE_CACHE_LOGICAL_TTL_MS,
  );
  if (cached?.data) {
    if ((cached.data as { miss?: boolean }).miss) return null;
    return cached.data as SnapshotHit;
  }
  try {
    // WR-01: throttle only after cache-miss is confirmed so that a
    // cache-hit path does not update lastNominatimCallMs and let a
    // subsequent uncached call bypass the 1 req/s Nominatim policy.
    await throttleNominatim();
    const candidates = await forwardGeocodeConstrained(hierarchy.landmark, {
      amenity,
      countrycodes: cc ?? ME_COUNTRY_CODES,
      viewbox: ME_VIEWBOX,
      addressdetails: true,
      limit: 3,
    });
    const filtered = candidates.filter((c) => {
      if (!cc) return true;
      return !c.address?.country_code || c.address.country_code === cc;
    });
    if (filtered.length === 0) {
        await cacheSetSafe(key, { miss: true }, GEOCODE_CACHE_REDIS_TTL_SEC);
      return null;
    }
    const first = filtered[0]!;
    const hit: SnapshotHit = { lat: first.lat, lng: first.lng, displayName: first.displayName };
    await cacheSetSafe(key, hit, GEOCODE_CACHE_REDIS_TTL_SEC);
    return hit;
  } catch (err) {
    log.warn({ err, landmark: hierarchy.landmark }, 'resolveViaPoiAmenity failed');
    return null;
  }
}

function buildDisplayNameForQuery(hierarchy: LocationHierarchyV2): string | null {
  const parts: string[] = [];
  if (hierarchy.landmark) parts.push(hierarchy.landmark);
  if (hierarchy.neighborhood) parts.push(hierarchy.neighborhood);
  if (hierarchy.city) parts.push(hierarchy.city);
  if (hierarchy.admin1) parts.push(hierarchy.admin1);
  if (hierarchy.country) parts.push(hierarchy.country);
  if (parts.length === 0) return null;
  return parts.join(', ');
}

async function resolveViaNominatimDirect(
  hierarchy: LocationHierarchyV2,
): Promise<SnapshotHit | null> {
  const query = buildDisplayNameForQuery(hierarchy);
  if (!query) return null;
  const cc = countryCodeFromName(hierarchy.country);
  const key = cacheKey('direct', { q: query, country: cc });
  const cached = await cacheGetSafe<SnapshotHit | { miss: true }>(
    key,
    GEOCODE_CACHE_LOGICAL_TTL_MS,
  );
  if (cached?.data) {
    if ((cached.data as { miss?: boolean }).miss) return null;
    return cached.data as SnapshotHit;
  }
  try {
    // WR-01: throttle only after cache-miss is confirmed so that a
    // cache-hit path does not update lastNominatimCallMs and let a
    // subsequent uncached call bypass the 1 req/s Nominatim policy.
    await throttleNominatim();
    const candidates = await forwardGeocodeConstrained(query, {
      countrycodes: cc ?? ME_COUNTRY_CODES,
      viewbox: ME_VIEWBOX,
      limit: 1,
    });
    if (candidates.length === 0) {
      await cacheSetSafe(key, { miss: true }, GEOCODE_CACHE_REDIS_TTL_SEC);
      return null;
    }
    const first = candidates[0]!;
    const hit: SnapshotHit = { lat: first.lat, lng: first.lng, displayName: first.displayName };
    await cacheSetSafe(key, hit, GEOCODE_CACHE_REDIS_TTL_SEC);
    return hit;
  } catch (err) {
    log.warn({ err, query }, 'nominatim-direct failed');
    return null;
  }
}

// Branch 4: nominatim-verified-2pass (D-04)
const rerankerResponseSchema = z
  .object({
    pick: z.number().int().min(1).max(5),
    reasoning: z.string().max(100),
  })
  .strict();

const RERANKER_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    pick: { type: 'integer', minimum: 1, maximum: 5 },
    reasoning: { type: 'string', maxLength: 100 },
  },
  required: ['pick', 'reasoning'],
  additionalProperties: false,
};

const RERANKER_SYSTEM_PROMPT =
  'You are picking the geocoding result most consistent with a conflict-event description. ' +
  'Output only JSON matching the schema. Do NOT invent coordinates.';

function buildRerankerUserPrompt(
  hierarchy: LocationHierarchyV2,
  candidates: Array<{ lat: number; lng: number; displayName: string; type: string }>,
  ctx: ResolveContext,
): string {
  const lines: string[] = [];
  const hierarchyStr = [
    hierarchy.landmark, hierarchy.neighborhood, hierarchy.city, hierarchy.admin1, hierarchy.country,
  ].filter(Boolean).join(', ');
  lines.push(
    `You extracted the location "${hierarchyStr}". Nominatim returned ${candidates.length} candidates.`,
  );
  lines.push('Pick the one most consistent with this event context:');
  lines.push('');
  if (ctx.summary) lines.push(`Summary: ${ctx.summary.slice(0, 400)}`);
  if (ctx.articleTitles && ctx.articleTitles.length > 0) {
    lines.push('Article titles:');
    for (const t of ctx.articleTitles.slice(0, 3)) lines.push(`  - ${t.slice(0, 140)}`);
  }
  lines.push('');
  lines.push('Candidates:');
  candidates.forEach((c, i) => {
    lines.push(`  ${i + 1}. ${c.displayName} [${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}] (${c.type})`);
  });
  lines.push('');
  lines.push('Respond with JSON: { "pick": <1-N>, "reasoning": "<=100 chars" }');
  return lines.join('\n');
}

function shouldTriggerTwoPassVerify(
  hierarchy: LocationHierarchyV2,
  hit: SnapshotHit,
  ctx: ResolveContext,
): boolean {
  const precision = derivePrecision(hierarchy);
  if (precision === 'region' || precision === 'city') return true;
  const dKm = haversineKm(hit.lat, hit.lng, ctx.centroidLat, ctx.centroidLng);
  if (dKm > 250) return true;
  return false;
}

async function resolveViaVerifiedTwoPass(
  hierarchy: LocationHierarchyV2,
  ctx: ResolveContext,
): Promise<SnapshotHit | null> {
  const query = buildDisplayNameForQuery(hierarchy);
  if (!query) return null;
  const cc = countryCodeFromName(hierarchy.country);
  const key = cacheKey('verify', { q: query, country: cc });
  const cached = await cacheGetSafe<SnapshotHit | { miss: true }>(
    key,
    GEOCODE_CACHE_LOGICAL_TTL_MS,
  );
  if (cached?.data) {
    if ((cached.data as { miss?: boolean }).miss) return null;
    return cached.data as SnapshotHit;
  }
  try {
    // WR-01: throttle only after cache-miss is confirmed so that a
    // cache-hit path does not update lastNominatimCallMs and let a
    // subsequent uncached call bypass the 1 req/s Nominatim policy.
    await throttleNominatim();
    const candidates = await forwardGeocodeConstrained(query, {
      countrycodes: cc ?? ME_COUNTRY_CODES,
      viewbox: ME_VIEWBOX,
      limit: 5,
      addressdetails: true,
    });
    if (candidates.length < 2) {
      await cacheSetSafe(key, { miss: true }, GEOCODE_CACHE_REDIS_TTL_SEC);
      return null;
    }
    const userPrompt = buildRerankerUserPrompt(hierarchy, candidates, ctx);
    const raw = await callLLM(
      [
        { role: 'system', content: RERANKER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      RERANKER_JSON_SCHEMA,
    );
    if (!raw) {
      await cacheSetSafe(key, { miss: true }, GEOCODE_CACHE_REDIS_TTL_SEC);
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const validated = rerankerResponseSchema.safeParse(parsed);
    if (!validated.success) {
      log.warn({ issues: validated.error.issues }, 'reranker response failed Zod parse');
      return null;
    }
    const idx = validated.data.pick - 1;
    if (idx < 0 || idx >= candidates.length) return null;
    const picked = candidates[idx]!;
    const hit: SnapshotHit = { lat: picked.lat, lng: picked.lng, displayName: picked.displayName };
    await cacheSetSafe(key, hit, GEOCODE_CACHE_REDIS_TTL_SEC);
    return hit;
  } catch (err) {
    log.warn({ err, query }, 'two-pass verify failed');
    return null;
  }
}

function resolveViaBellingcat(ctx: ResolveContext): SnapshotHit | null {
  if (!ctx.bellingcatCoord) return null;
  return {
    lat: ctx.bellingcatCoord.lat,
    lng: ctx.bellingcatCoord.lng,
    displayName: 'Bellingcat-reported coordinate',
  };
}

function resolveViaActionGeoFallback(ctx: ResolveContext): SnapshotHit {
  return {
    lat: ctx.centroidLat,
    lng: ctx.centroidLng,
    displayName: 'GDELT ActionGeo centroid',
  };
}

export async function resolveLocation(
  hierarchy: LocationHierarchyV2,
  ctx: ResolveContext,
): Promise<ResolvedLocation> {
  // Branch 1
  try {
    const hit = resolveFromSnapshot(hierarchy);
    if (hit) {
      return {
        ...hit,
        provenance: 'own-site-snapshot',
        actionGeoDistanceKm: haversineKm(hit.lat, hit.lng, ctx.centroidLat, ctx.centroidLng),
      };
    }
  } catch (err) {
    log.warn({ err }, 'own-site-snapshot path threw');
  }

  // Branch 2
  if (isPoiLandmark(hierarchy.landmark)) {
    try {
      const hit = await resolveViaPoiAmenity(hierarchy);
      if (hit) {
        return {
          ...hit,
          provenance: 'poi-amenity-nominatim',
          actionGeoDistanceKm: haversineKm(hit.lat, hit.lng, ctx.centroidLat, ctx.centroidLng),
        };
      }
    } catch (err) {
      log.warn({ err }, 'poi-amenity-nominatim path threw');
    }
  }

  // Branch 3
  let directHit: SnapshotHit | null = null;
  try {
    directHit = await resolveViaNominatimDirect(hierarchy);
  } catch (err) {
    log.warn({ err }, 'nominatim-direct path threw');
  }

  // Branch 4
  if (directHit && shouldTriggerTwoPassVerify(hierarchy, directHit, ctx)) {
    try {
      const verified = await resolveViaVerifiedTwoPass(hierarchy, ctx);
      if (verified) {
        return {
          ...verified,
          provenance: 'nominatim-verified-2pass',
          actionGeoDistanceKm: haversineKm(
            verified.lat, verified.lng, ctx.centroidLat, ctx.centroidLng,
          ),
        };
      }
    } catch (err) {
      log.warn({ err }, 'two-pass verify path threw; accepting direct hit');
    }
  }

  if (directHit) {
    return {
      ...directHit,
      provenance: 'nominatim-direct',
      actionGeoDistanceKm: haversineKm(
        directHit.lat, directHit.lng, ctx.centroidLat, ctx.centroidLng,
      ),
    };
  }

  // Branch 5
  try {
    const hit = resolveViaBellingcat(ctx);
    if (hit) {
      return {
        ...hit,
        provenance: 'bellingcat-coord-passthrough',
        actionGeoDistanceKm: haversineKm(hit.lat, hit.lng, ctx.centroidLat, ctx.centroidLng),
      };
    }
  } catch (err) {
    log.warn({ err }, 'bellingcat path threw');
  }

  // Branch 6
  const hit = resolveViaActionGeoFallback(ctx);
  return { ...hit, provenance: 'gdelt-actiongeo-fallback', actionGeoDistanceKm: 0 };
}
