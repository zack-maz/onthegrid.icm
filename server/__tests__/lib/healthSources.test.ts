// @vitest-environment node
/**
 * Phase 28.1 W2 Task 1 — Shared SOURCE_KEYS / FRESHNESS_THRESHOLDS_MS / TIER_BY_ENDPOINT
 * + deriveStatus() pure helper.
 *
 * Tests cover:
 *   - Test 3: deriveStatus enum branches (healthy/degraded/unhealthy/unknown + error)
 *   - Test 4: SOURCE_KEYS values match the canonical values + DRIFT-1/2/3 corrections
 *   - Test 5: TIER_BY_ENDPOINT membership per D-26
 */

import { describe, it, expect } from 'vitest';

import {
  SOURCE_KEYS,
  FRESHNESS_THRESHOLDS_MS,
  TIER_BY_ENDPOINT,
  deriveStatus,
} from '../../lib/healthSources.js';

describe('deriveStatus()', () => {
  it('returns healthy when freshness <= threshold and no error (Test 3a)', () => {
    expect(deriveStatus(0, 60_000, false)).toBe('healthy');
    expect(deriveStatus(60_000, 60_000, false)).toBe('healthy');
  });

  it('returns degraded when threshold < freshness <= 2*threshold (Test 3b)', () => {
    expect(deriveStatus(70_000, 60_000, false)).toBe('degraded');
    expect(deriveStatus(120_000, 60_000, false)).toBe('degraded');
  });

  it('returns unhealthy when freshness > 2*threshold (Test 3c)', () => {
    expect(deriveStatus(140_000, 60_000, false)).toBe('unhealthy');
    expect(deriveStatus(999_999_999, 60_000, false)).toBe('unhealthy');
  });

  it('returns unknown when freshness is null and no error (Test 3d)', () => {
    expect(deriveStatus(null, 60_000, false)).toBe('unknown');
  });

  it('returns unhealthy when hadError is true (Test 3e)', () => {
    expect(deriveStatus(0, 60_000, true)).toBe('unhealthy');
    expect(deriveStatus(null, 60_000, true)).toBe('unhealthy');
    expect(deriveStatus(140_000, 60_000, true)).toBe('unhealthy');
  });
});

describe('SOURCE_KEYS', () => {
  it('contains all canonical entries — DRIFT-1/2/3 fixes applied (Test 4)', () => {
    // Hot polling endpoints
    expect(SOURCE_KEYS.flights).toBe('flights:adsblol');
    expect(SOURCE_KEYS.ships).toBe('ships:ais');
    expect(SOURCE_KEYS.events).toBe('events:gdelt');
    // DRIFT-1 fix: news route writes news:feed, not news:gdelt
    expect(SOURCE_KEYS.news).toBe('news:feed');
    expect(SOURCE_KEYS.markets).toBe('markets:yahoo:1d');
    expect(SOURCE_KEYS.weather).toBe('weather:open-meteo');
    // DRIFT-2 fix: sites route writes sites:v3
    expect(SOURCE_KEYS.sites).toBe('sites:v3');
    // DRIFT-3 fix: water route writes water:facilities:v3
    expect(SOURCE_KEYS.water).toBe('water:facilities:v3');
  });
});

describe('FRESHNESS_THRESHOLDS_MS', () => {
  it('matches the D-25 thresholds verbatim', () => {
    expect(FRESHNESS_THRESHOLDS_MS.flights).toBe(2 * 60_000);
    expect(FRESHNESS_THRESHOLDS_MS.ships).toBe(5 * 60_000);
    expect(FRESHNESS_THRESHOLDS_MS.events).toBe(30 * 60_000);
    expect(FRESHNESS_THRESHOLDS_MS.news).toBe(30 * 60_000);
    expect(FRESHNESS_THRESHOLDS_MS.markets).toBe(5 * 60_000);
    expect(FRESHNESS_THRESHOLDS_MS.sites).toBe(48 * 60 * 60_000);
    expect(FRESHNESS_THRESHOLDS_MS.water).toBe(48 * 60 * 60_000);
    expect(FRESHNESS_THRESHOLDS_MS.waterPrecip).toBe(12 * 60 * 60_000);
    expect(FRESHNESS_THRESHOLDS_MS.sources).toBe(10 * 60_000);
    expect(FRESHNESS_THRESHOLDS_MS.llmStatus).toBe(5 * 60_000);
    expect(FRESHNESS_THRESHOLDS_MS.authCheck).toBe(0);
    expect(FRESHNESS_THRESHOLDS_MS.geocode).toBe(0);
    expect(FRESHNESS_THRESHOLDS_MS.cronHealth).toBe(26 * 60 * 60_000);
    expect(FRESHNESS_THRESHOLDS_MS.cronWarm).toBe(26 * 60 * 60_000);
    expect(FRESHNESS_THRESHOLDS_MS.cronRefreshEvents).toBe(26 * 60 * 60_000);
  });
});

describe('TIER_BY_ENDPOINT', () => {
  it('classifies critical-tier endpoints (Test 5a)', () => {
    expect(TIER_BY_ENDPOINT.flights).toBe('critical');
    expect(TIER_BY_ENDPOINT.ships).toBe('critical');
    expect(TIER_BY_ENDPOINT.events).toBe('critical');
  });

  it('classifies non-critical-tier endpoints (Test 5b)', () => {
    expect(TIER_BY_ENDPOINT.markets).toBe('non-critical');
    expect(TIER_BY_ENDPOINT.news).toBe('non-critical');
    expect(TIER_BY_ENDPOINT.waterPrecip).toBe('non-critical');
    expect(TIER_BY_ENDPOINT.sources).toBe('non-critical');
    expect(TIER_BY_ENDPOINT.llmStatus).toBe('non-critical');
  });

  it('classifies static-tier endpoints (Test 5c)', () => {
    expect(TIER_BY_ENDPOINT.sites).toBe('static');
    expect(TIER_BY_ENDPOINT.water).toBe('static');
  });

  it('classifies probe-only endpoints (Test 5d)', () => {
    expect(TIER_BY_ENDPOINT.authCheck).toBe('probe-only');
    expect(TIER_BY_ENDPOINT.geocode).toBe('probe-only');
  });

  it('classifies cron endpoints (Test 5e)', () => {
    expect(TIER_BY_ENDPOINT.cronHealth).toBe('cron');
    expect(TIER_BY_ENDPOINT.cronWarm).toBe('cron');
    expect(TIER_BY_ENDPOINT.cronRefreshEvents).toBe('cron');
  });
});
