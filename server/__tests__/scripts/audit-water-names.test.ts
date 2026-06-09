// Unit test for the WATER-LATIN-01 audit's pure logic (per-script bucketing +
// gate-rejection counting). The pure functions are imported from the audit
// script so the test exercises the logic WITHOUT any Redis I/O.

import { describe, it, expect } from 'vitest';

import {
  classifyScript,
  buildNameAuditReport,
  type NameAuditFacility,
} from '../../../scripts/audit-water-names.js';

/** Minimal facility-tags fixture factory. */
function fac(name: string, opts: Partial<NameAuditFacility> = {}): NameAuditFacility {
  return {
    osmId: opts.osmId ?? 1,
    facilityType: opts.facilityType ?? 'dam',
    tags: { name, ...(opts.tags ?? {}) },
  };
}

describe('classifyScript — Unicode-block classification (WATER-LATIN-01)', () => {
  it('classifies Latin names as latin', () => {
    expect(classifyScript('Mosul Dam')).toBe('latin');
  });

  it('classifies Arabic names as arabic', () => {
    expect(classifyScript('سد الموصل')).toBe('arabic');
  });

  it('classifies Persian names (Arabic block) as arabic', () => {
    // Persian uses the Arabic Unicode block; the audit buckets it as arabic.
    expect(classifyScript('تهران')).toBe('arabic');
  });

  it('classifies Hebrew names as hebrew', () => {
    expect(classifyScript('תל אביב')).toBe('hebrew');
  });

  it('classifies empty / digit-only names as latin (no non-Latin block)', () => {
    expect(classifyScript('12345')).toBe('latin');
  });
});

describe('buildNameAuditReport — per-script bucketing + gate rejections', () => {
  const facilities: NameAuditFacility[] = [
    fac('Mosul Dam'), // latin, admits
    fac('Karkheh Dam'), // latin, admits
    fac('سد الموصل'), // arabic, rejected by Latin gate
    fac('تهران'), // arabic (Persian), rejected
    fac('محطة تحلية'), // arabic, rejected
    fac('תל אביב'), // hebrew, rejected
    fac('מאגר כנרת'), // hebrew, rejected
  ];

  const report = buildNameAuditReport(facilities);

  it('counts total facilities', () => {
    expect(report.total).toBe(7);
  });

  it('counts facilities rejected by the Latin-label gate', () => {
    // 5 non-Latin names fail hasLatinLabel.
    expect(report.gateRejectedCount).toBe(5);
  });

  it('buckets rejected names per script', () => {
    expect(report.byScript.arabic).toBe(3);
    expect(report.byScript.hebrew).toBe(2);
    // Latin facilities are not rejected, so the latin reject bucket is 0.
    expect(report.byScript.latin).toBe(0);
  });

  it('carries sample names per script for eyeballing', () => {
    expect(report.samples.arabic.length).toBeGreaterThan(0);
    expect(report.samples.hebrew.length).toBeGreaterThan(0);
    expect(report.samples.arabic).toContain('سد الموصل');
  });

  it('handles an empty corpus without throwing', () => {
    const empty = buildNameAuditReport([]);
    expect(empty.total).toBe(0);
    expect(empty.gateRejectedCount).toBe(0);
    expect(empty.byScript.arabic).toBe(0);
  });
});
