// @vitest-environment node
/**
 * Phase 33 Plan 01 Task 1 (D-02) — RED-phase unit tests for the shared
 * deterministic actor classifier.
 *
 * The classifier is the SINGLE source of truth for the D-02 failure-bucket
 * rules: both the one-shot audit script (ACTOR-01) AND the lazy compute in
 * /api/operator-status (ACTOR-05 — landing in Plan 33-06) must run identical
 * classification. Pitfall §1 (code duplication) is prevented by factoring
 * out here.
 *
 * Bucket d (source-disagreement) is intentionally NOT covered — it requires
 * a second LLM pass against live cache and is reserved for human spot-check
 * in the audit report (D-02 final clause).
 *
 * Implementation lands in Task 2 (GREEN); this file ships failing per Wave 0.
 */
import { describe, it, expect } from 'vitest';

import { classifyActor, classifyEventActors } from '../../lib/actorClassifier.js';

const codebook = new Set(['ISRMIL', 'IRNMIL', 'USMIL']);

describe('classifyActor — D-02 deterministic rules', () => {
  it('bucket (a) — empty string returns "null"', () => {
    expect(classifyActor('', codebook)).toBe('null');
  });

  it('bucket (a) — whitespace-only string returns "null"', () => {
    expect(classifyActor('   ', codebook)).toBe('null');
  });

  it('bucket (b) — raw CAMEO code matching codebook returns "raw-cameo"', () => {
    expect(classifyActor('ISRMIL', codebook)).toBe('raw-cameo');
    expect(classifyActor('IRNMIL', codebook)).toBe('raw-cameo');
    expect(classifyActor('USMIL', codebook)).toBe('raw-cameo');
  });

  it('bucket (b) negative — regex matches but NOT in codebook returns "ok"', () => {
    // 'XYZAB' matches /^[A-Z]{3,5}$/ but is not in the fixture codebook,
    // so it should fall through to 'ok' — the codebook is the
    // authoritative filter, the regex alone is not enough.
    expect(classifyActor('XYZAB', codebook)).toBe('ok');
  });

  it('bucket (c) — case-insensitive deny-list match returns "ambiguous"', () => {
    expect(classifyActor('Forces', codebook)).toBe('ambiguous');
    expect(classifyActor('FIGHTERS', codebook)).toBe('ambiguous');
    expect(classifyActor('the army', codebook)).toBe('ambiguous');
    expect(classifyActor('militia', codebook)).toBe('ambiguous');
  });

  it('clean string returns "ok"', () => {
    expect(classifyActor('Islamic Revolutionary Guard Corps', codebook)).toBe('ok');
  });
});

describe('classifyEventActors — bucket (a) covers null + all-empty', () => {
  it('null actors → ["null"]', () => {
    expect(classifyEventActors(null, codebook)).toEqual(['null']);
  });

  it('undefined actors → ["null"]', () => {
    expect(classifyEventActors(undefined, codebook)).toEqual(['null']);
  });

  it('empty-array actors → ["null"]', () => {
    expect(classifyEventActors([], codebook)).toEqual(['null']);
  });

  it('all-empty-string actors → ["null"]', () => {
    expect(classifyEventActors(['', '   '], codebook)).toEqual(['null']);
  });

  it('mixed clean + ambiguous → length-locked per-entry classification', () => {
    expect(classifyEventActors(['IDF', 'forces'], codebook)).toEqual(['ok', 'ambiguous']);
  });

  it('mixed clean + raw-cameo + ambiguous → length-locked per-entry classification', () => {
    expect(classifyEventActors(['IDF', 'ISRMIL', 'troops'], codebook)).toEqual([
      'ok',
      'raw-cameo',
      'ambiguous',
    ]);
  });
});
