// @vitest-environment node
/**
 * Phase 28.1 W2 Task 1 — Zod schema for the /api/health response.
 *
 * Validates:
 *   - Test 1: a fully-shaped valid response parses successfully
 *   - Test 2: an invalid status enum value throws ZodError
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
  healthResponseSchema,
  endpointHealthSchema,
  healthStatusEnum,
  healthTierEnum,
  type HealthResponse,
  type EndpointHealth,
  type HealthStatus,
  type HealthTier,
} from '../../lib/healthSchema.js';

describe('healthSchema', () => {
  it('healthStatusEnum and healthTierEnum expose the documented enum members', () => {
    expect(healthStatusEnum.options).toEqual(['healthy', 'degraded', 'unhealthy', 'unknown']);
    expect(healthTierEnum.options).toEqual([
      'critical',
      'non-critical',
      'static',
      'probe-only',
      'cron',
    ]);
  });

  it('endpointHealthSchema parses a valid endpoint entry', () => {
    const valid: EndpointHealth = {
      name: 'flights',
      status: 'healthy',
      tier: 'critical',
      lastSuccessTs: Date.now() - 10_000,
      lastErrorReason: null,
      freshnessMs: 10_000,
      freshnessThresholdMs: 120_000,
      latencyMs: 12,
    };
    const parsed = endpointHealthSchema.parse(valid);
    expect(parsed).toEqual(valid);
  });

  it('healthResponseSchema parses a valid full response (Test 1)', () => {
    const validResponse: HealthResponse = {
      endpoints: {
        flights: {
          name: 'flights',
          status: 'healthy',
          tier: 'critical',
          lastSuccessTs: Date.now() - 10_000,
          lastErrorReason: null,
          freshnessMs: 10_000,
          freshnessThresholdMs: 120_000,
          latencyMs: 12,
        },
        sites: {
          name: 'sites',
          status: 'unknown',
          tier: 'static',
          lastSuccessTs: null,
          lastErrorReason: null,
          freshnessMs: null,
          freshnessThresholdMs: 172_800_000,
          latencyMs: null,
        },
      },
      summary: {
        critical: { healthy: 1, degraded: 0, unhealthy: 0, unknown: 0 },
        nonCritical: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
        static: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 1 },
        probeOnly: { healthy: 0, unhealthy: 0, unknown: 0 },
        cron: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
      },
      generatedAt: Date.now(),
    };
    const parsed = healthResponseSchema.parse(validResponse);
    expect(parsed.endpoints.flights?.status).toBe('healthy');
    expect(parsed.endpoints.sites?.status).toBe('unknown');
    expect(parsed.summary.critical.healthy).toBe(1);
    expect(parsed.summary.static.unknown).toBe(1);
  });

  it('healthResponseSchema rejects an invalid status enum value (Test 2)', () => {
    const invalid = {
      endpoints: {
        flights: {
          name: 'flights',
          status: 'totally-broken', // INVALID — not in healthStatusEnum
          tier: 'critical',
          lastSuccessTs: null,
          lastErrorReason: null,
          freshnessMs: null,
          freshnessThresholdMs: 120_000,
          latencyMs: null,
        },
      },
      summary: {
        critical: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 1 },
        nonCritical: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
        static: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
        probeOnly: { healthy: 0, unhealthy: 0, unknown: 0 },
        cron: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
      },
      generatedAt: Date.now(),
    };
    expect(() => healthResponseSchema.parse(invalid)).toThrow(z.ZodError);
  });

  it('healthResponseSchema rejects extra unknown fields under .strict()', () => {
    const withExtra = {
      endpoints: {},
      summary: {
        critical: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
        nonCritical: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
        static: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
        probeOnly: { healthy: 0, unhealthy: 0, unknown: 0 },
        cron: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
      },
      generatedAt: Date.now(),
      extraField: 'should-be-rejected',
    };
    expect(() => healthResponseSchema.parse(withExtra)).toThrow(z.ZodError);
  });

  it('inferred TS types align with the enum unions (compile-only sanity)', () => {
    const status: HealthStatus = 'degraded';
    const tier: HealthTier = 'non-critical';
    expect(status).toBe('degraded');
    expect(tier).toBe('non-critical');
  });
});
