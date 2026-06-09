// @vitest-environment node
//
// WATER-LATIN-02 (Phase 38, Plan 04) — romanize() acceptance test.
//
// The bar this test enforces is the RESET D-08 acceptance bar: a
// MACHINE-SEARCHABLE LATIN TOKEN that admits the facility past the
// overpass-water Latin-label gate — NOT a pretty human romanization.
// Per RESEARCH §WATER-LATIN-02, abjad scripts (Arabic/Persian/Hebrew)
// are vowel-less at the code-point level, so NO pure-JS library can
// vowelize them. We therefore assert three honest properties on the
// romanized output and explicitly DO NOT assert pretty-name equality:
//   1. passes isLatin (the same guard overpass-water.ts:397 uses)
//   2. contains no `@` artifact (ة → "@" from the raw transliterator)
//   3. is >= 2 chars (so the gate admits, not a pure-diacritic stub)
//   4. carries no UPPERCASE emphatic artifacts (S/H/T/D/Z/G from
//      raw transliterate of ص/ح/ط/د/ز/غ)

import { describe, it, expect } from 'vitest';

import { romanize } from '../../lib/romanize';

/** Mirror of overpass-water.ts:397 isLatin — kept in sync intentionally. */
function isLatin(str: string): boolean {
  return /^[\p{Script=Latin}\d\s\p{P}\p{S}]+$/u.test(str);
}

/** The four RESET-bar properties bundled for reuse across samples. */
function expectSearchableLatinToken(out: string) {
  // 3. >= 2 chars
  expect(out.trim().length).toBeGreaterThanOrEqual(2);
  // 1. passes isLatin (the actual admission guard)
  expect(isLatin(out)).toBe(true);
  // 2. no `@` artifact
  expect(out).not.toContain('@');
  // 4. no uppercase emphatic artifacts left over from raw transliterate.
  //    After cleanup every emphatic consonant must be lowercased; the only
  //    legitimate uppercase is the leading title-case letter of each word.
  for (const word of out.split(/\s+/).filter(Boolean)) {
    const interior = word.slice(1);
    expect(interior).toBe(interior.toLowerCase());
  }
}

describe('romanize() — RESET searchable-token bar (WATER-LATIN-02 / D-08)', () => {
  // The RESEARCH §WATER-LATIN-02 empirical sample table.
  const samples: Array<{ name: string; input: string; rawArtifact: string }> = [
    { name: 'Arabic — Baghdad', input: 'بغداد', rawArtifact: 'bGdd (uppercase G)' },
    { name: 'Arabic — Mosul Dam', input: 'سد الموصل', rawArtifact: 'sd lmwSl (uppercase S)' },
    { name: 'Arabic — desal plant', input: 'محطة تحلية', rawArtifact: 'mHT@ tHly@ (@ + H/T)' },
    { name: 'Persian — Tehran', input: 'تهران', rawArtifact: 'thrn' },
    { name: 'Persian — Karaj Dam', input: 'سد کرج', rawArtifact: 'sd khrj' },
    { name: 'Hebrew — Kinneret reservoir', input: 'מאגר כנרת', rawArtifact: 'mgr knrt' },
    { name: 'Hebrew — Tel Aviv', input: 'תל אביב', rawArtifact: 'tl byb' },
  ];

  for (const { name, input } of samples) {
    it(`produces a searchable Latin token for ${name} (${input})`, () => {
      const out = romanize(input);
      expectSearchableLatinToken(out);
    });
  }

  it('strips the ة → @ artifact specifically (Arabic ة override)', () => {
    // "محطة تحلية" raw transliterates to "mHT@ tHly@" — both @ must be gone.
    const out = romanize('محطة تحلية');
    expect(out).not.toContain('@');
    expect(out.toLowerCase()).toContain('a'); // ة mapped to a/ah, not dropped to empty
  });

  it('lowercases the uppercase emphatic artifacts (ص/ط/ح/etc.)', () => {
    // "سد الموصل" raw → "sd lmwSl"; the S (ص) must be lowercased.
    const out = romanize('سد الموصل').toLowerCase();
    expect(out).toContain('s');
    // The cleaned output (case-insensitive) still carries the consonant skeleton.
    expect(out.replace(/\s/g, '')).toContain('sd');
  });

  it('passes a Latin name through unchanged in script (no mangling)', () => {
    const out = romanize('Mosul Dam');
    expect(isLatin(out)).toBe(true);
    expect(out.toLowerCase()).toContain('mosul');
  });

  it('falls back to a >=2-char token for pure-diacritic / empty input', () => {
    // Pure-diacritic / empty-after-cleanup input must still yield an admitting token.
    const out = romanize('ّ'); // a lone Arabic shadda (combining diacritic)
    expect(out.trim().length).toBeGreaterThanOrEqual(2);
    expect(isLatin(out)).toBe(true);
  });

  it('collapses repeated separators into single spaces', () => {
    const out = romanize('سد   ---  الموصل');
    expect(out).not.toMatch(/\s{2,}/);
    expect(out).not.toMatch(/--/);
  });
});
