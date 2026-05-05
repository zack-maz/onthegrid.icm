// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { buildAuditRecord, type PipelineTrace, type AuditRecord } from '../../lib/eventAudit.js';

import type { ConflictEventEntity } from '../../types.js';

/** Build a minimal ConflictEventEntity for testing. */
function makeEvent(id: string): ConflictEventEntity {
  return {
    id,
    type: 'ground_combat',
    lat: 35.6892,
    lng: 51.389,
    timestamp: Date.now(),
    label: 'test event',
    data: {
      eventType: 'Conventional military force',
      subEventType: 'CAMEO 190',
      fatalities: 0,
      actor1: 'A',
      actor2: 'B',
      notes: '',
      source: '',
      goldsteinScale: -5,
      locationName: 'Tehran',
      cameoCode: '190',
      confidence: 0.72,
      geoPrecision: 'centroid',
    },
  };
}

function makeTrace(overrides: Partial<PipelineTrace> = {}): PipelineTrace {
  return {
    phaseA: {
      rootCode: true,
      cameoExclusion: true,
      middleEast: true,
      geoValid: true,
      minSources: true,
      actorCountry: true,
    },
    phaseB: {
      originalType: 'ground_combat',
      reclassified: false,
      geoPrecision: 'centroid',
      confidenceSubScores: {
        mediaCoverage: 0.8,
        sourceDiversity: 0.6,
        actorSpecificity: 1.0,
        geoPrecisionSignal: 0.3,
        goldsteinConsistency: 0.9,
        cameoSpecificity: 0.5,
      },
      finalConfidence: 0.72,
      passedThreshold: true,
    },
    ...overrides,
  };
}

describe('buildAuditRecord', () => {
  it('produces accepted record with full trace', () => {
    const event = makeEvent('gdelt-123');
    const trace = makeTrace();
    const rawCols: Record<string, string> = {
      GLOBALEVENTID: '123',
      SQLDATE: '20260315',
    };

    const record: AuditRecord = buildAuditRecord({
      id: 'gdelt-123',
      status: 'accepted',
      event,
      pipelineTrace: trace,
      rawGdeltColumns: rawCols,
    });

    expect(record.id).toBe('gdelt-123');
    expect(record.status).toBe('accepted');
    expect(record.event).toBeDefined();
    expect(record.event!.id).toBe('gdelt-123');
    expect(record.pipelineTrace.phaseA.rootCode).toBe(true);
    expect(record.pipelineTrace.phaseB.finalConfidence).toBe(0.72);
    expect(record.rawGdeltColumns.GLOBALEVENTID).toBe('123');
  });

  it('produces rejected record with rejection reason', () => {
    const trace = makeTrace({
      rejectionReason: 'Below confidence threshold (0.15 < 0.35)',
      phaseB: {
        ...makeTrace().phaseB,
        passedThreshold: false,
        finalConfidence: 0.15,
      },
    });

    const record: AuditRecord = buildAuditRecord({
      id: 'gdelt-456',
      status: 'rejected',
      event: null,
      pipelineTrace: trace,
      rawGdeltColumns: { GLOBALEVENTID: '456' },
    });

    expect(record.id).toBe('gdelt-456');
    expect(record.status).toBe('rejected');
    expect(record.event).toBeNull();
    expect(record.pipelineTrace.rejectionReason).toBe('Below confidence threshold (0.15 < 0.35)');
  });

  it('PipelineTrace sub-scores are present and valid numbers', () => {
    const trace = makeTrace();
    const scores = trace.phaseB.confidenceSubScores;

    expect(typeof scores.mediaCoverage).toBe('number');
    expect(typeof scores.sourceDiversity).toBe('number');
    expect(typeof scores.actorSpecificity).toBe('number');
    expect(typeof scores.geoPrecisionSignal).toBe('number');
    expect(typeof scores.goldsteinConsistency).toBe('number');
    expect(typeof scores.cameoSpecificity).toBe('number');

    // All should be 0-1 range
    for (const val of Object.values(scores)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it('supports optional dispersion info', () => {
    const trace = makeTrace({
      dispersion: {
        ringIndex: 0,
        slotIndex: 2,
        originalLat: 35.6892,
        originalLng: 51.389,
        dispersedLat: 35.71,
        dispersedLng: 51.4,
      },
    });

    expect(trace.dispersion).toBeDefined();
    expect(trace.dispersion!.ringIndex).toBe(0);
    expect(trace.dispersion!.slotIndex).toBe(2);
  });

  it('supports optional actionGeoType', () => {
    const trace = makeTrace({ actionGeoType: 3 });
    expect(trace.actionGeoType).toBe(3);
  });

  it('supports optional bellingcatMatch', () => {
    const trace = makeTrace({ bellingcatMatch: true });
    expect(trace.bellingcatMatch).toBe(true);
  });
});
