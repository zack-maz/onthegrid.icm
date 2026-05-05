// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  classifyWaterType,
  normalizeWaterElement,
  isPriorityCountry,
  isNotable,
  hasName,
  hasCapacityData,
  FACILITY_TYPE_LABELS,
  extractCapacityTags,
  findNearestCity,
  linkRiver,
  computeNotabilityScore,
  computeAdmissionDecision,
  RIVER_BBOXES,
} from '../../adapters/overpass-water.js';
import { fetchWaterFacilities, nearestCountryName } from '../../adapters/overpass-water.js';

import type { WaterStressIndicators } from '../../types.js';

describe('classifyWaterType', () => {
  it('returns "dam" for waterway=dam', () => {
    expect(classifyWaterType({ waterway: 'dam' })).toBe('dam');
  });

  it('returns "reservoir" for natural=water + water=reservoir', () => {
    expect(classifyWaterType({ natural: 'water', water: 'reservoir' })).toBe('reservoir');
  });

  it('returns "desalination" for man_made=desalination_plant', () => {
    expect(classifyWaterType({ man_made: 'desalination_plant' })).toBe('desalination');
  });

  it('returns "desalination" for water_works=desalination', () => {
    expect(classifyWaterType({ water_works: 'desalination' })).toBe('desalination');
  });

  it('returns null for unrelated tags', () => {
    expect(classifyWaterType({ highway: 'primary' })).toBeNull();
  });

  it('returns null for canal tags (not a facility type)', () => {
    expect(classifyWaterType({ waterway: 'canal' })).toBeNull();
  });
});

describe('classifyWaterType (Phase 27.3)', () => {
  it('returns "dam" for waterway=dam', () => {
    expect(classifyWaterType({ waterway: 'dam' })).toBe('dam');
  });
  it('returns "dam" for man_made=dam (D-01 union)', () => {
    expect(classifyWaterType({ man_made: 'dam' })).toBe('dam');
  });
  it('returns "reservoir" for landuse=reservoir', () => {
    expect(classifyWaterType({ landuse: 'reservoir' })).toBe('reservoir');
  });
  it('returns null for man_made=water_works (treatment_plant removed)', () => {
    expect(classifyWaterType({ man_made: 'water_works' })).toBeNull();
  });
});

describe('isPriorityCountry', () => {
  it('returns true for coords near Israel (31.0, 34.9)', () => {
    expect(isPriorityCountry(31.0, 34.9)).toBe(true);
  });

  it('returns true for coords near Iraq (33.2, 43.7)', () => {
    expect(isPriorityCountry(33.2, 43.7)).toBe(true);
  });

  it('returns true for coords near Iran (32.4, 53.7)', () => {
    expect(isPriorityCountry(32.4, 53.7)).toBe(true);
  });

  it('returns true for coords near Afghanistan (33.9, 67.7)', () => {
    expect(isPriorityCountry(33.9, 67.7)).toBe(true);
  });

  it('returns true for coords near Jordan (31.2, 36.5)', () => {
    expect(isPriorityCountry(31.2, 36.5)).toBe(true);
  });

  it('returns true for coords near Lebanon (33.9, 35.9)', () => {
    expect(isPriorityCountry(33.9, 35.9)).toBe(true);
  });

  it('returns true for coords near Syria (35.0, 38.0)', () => {
    expect(isPriorityCountry(35.0, 38.0)).toBe(true);
  });

  // Round 3 (reservoirs-missing-after-05): PRIORITY_COUNTRIES expanded to the
  // full Middle East. Saudi Arabia, UAE, Kuwait, Qatar, Egypt, Turkey, and
  // Yemen are all now priority; assertions flipped accordingly.
  it('returns true for coords near Saudi Arabia (23.9, 45.1) — Round 3 expansion', () => {
    expect(isPriorityCountry(23.9, 45.1)).toBe(true);
  });

  it('returns true for coords near UAE (23.4, 53.8) — Round 3 expansion', () => {
    expect(isPriorityCountry(23.4, 53.8)).toBe(true);
  });

  it('returns true for coords near Kuwait (29.3, 47.5) — Round 3 expansion', () => {
    expect(isPriorityCountry(29.3, 47.5)).toBe(true);
  });

  it('returns true for coords near Egypt (26.8, 30.8) — Round 3 expansion', () => {
    expect(isPriorityCountry(26.8, 30.8)).toBe(true);
  });

  // Phase 27.3.1 Plan 10 (G2): Turkey removed from PRIORITY_COUNTRIES.
  // The assertion flipped from Round 3's `.toBe(true)`. Coord (39.5, 40.0)
  // is inside the 600km-from-Diyarbakir carve-out AND its nearest centroid
  // is Turkey (39.0, 35.2). Under Round 3's Turkey-in-priority set this
  // was true; under Plan 10 it is false. This is the primary source of
  // truth that Turkey is NOT in PRIORITY_COUNTRIES.
  //
  // Note: the pre-Plan-10 fixture used (37.9, 40.2) — that coordinate's
  // nearest centroid actually resolves to Syria (378km) not Turkey
  // (~430km), so it was a latent bug in the Round 3 test. Plan 10 fixes
  // the fixture to a coordinate whose attribution is unambiguously Turkey.
  it('returns false for eastern-central Turkey coord (39.5, 40.0) — Plan 10 G2 removed Turkey', () => {
    expect(isPriorityCountry(39.5, 40.0)).toBe(false);
  });

  it('returns true for coords near Yemen (15.6, 48.5) — Round 3 expansion', () => {
    expect(isPriorityCountry(15.6, 48.5)).toBe(true);
  });

  // Non-priority countries still within the Middle East bbox
  it('returns false for coords near Oman (21.5, 55.9)', () => {
    expect(isPriorityCountry(21.5, 55.9)).toBe(false);
  });

  it('returns false for coords near Pakistan (30.4, 69.3)', () => {
    expect(isPriorityCountry(30.4, 69.3)).toBe(false);
  });
});

describe('isNotable', () => {
  it('returns true for tags with wikidata', () => {
    expect(isNotable({ name: 'Test Dam', wikidata: 'Q12345' })).toBe(true);
  });

  it('returns true for tags with wikipedia', () => {
    expect(isNotable({ name: 'Test Dam', wikipedia: 'en:Test Dam' })).toBe(true);
  });

  it('returns true for tags with wikipedia:en', () => {
    expect(isNotable({ name: 'Test Dam', 'wikipedia:en': 'Test Dam' })).toBe(true);
  });

  it('returns false for tags with only name (no wikidata/wikipedia)', () => {
    expect(isNotable({ name: 'Test Dam' })).toBe(false);
  });

  it('returns false for empty tags', () => {
    expect(isNotable({})).toBe(false);
  });
});

describe('normalizeWaterElement', () => {
  const mockStress: WaterStressIndicators = {
    bws_raw: 3.5,
    bws_score: 3.5,
    bws_label: 'High',
    drr_score: 2.0,
    gtd_score: 1.5,
    sev_score: 2.5,
    iav_score: 3.0,
    compositeHealth: 0.3,
  };
  const stressLookup = () => mockStress;

  it('creates WaterFacility with correct id format "water-{osmId}"', () => {
    const el = {
      type: 'node' as const,
      id: 12345,
      lat: 33.3,
      lon: 44.4,
      tags: { waterway: 'dam', name: 'Mosul Dam', wikidata: 'Q123' },
    };
    const result = normalizeWaterElement(el, stressLookup);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('water-12345');
    expect(result!.type).toBe('water');
    expect(result!.facilityType).toBe('dam');
    expect(result!.lat).toBe(33.3);
    expect(result!.lng).toBe(44.4);
    expect(result!.label).toBe('Mosul Dam');
    expect(result!.osmId).toBe(12345);
    expect(result!.stress).toEqual(mockStress);
  });

  it('uses center coordinates for way/relation elements', () => {
    const el = {
      type: 'way' as const,
      id: 67890,
      center: { lat: 35.0, lon: 45.0 },
      tags: { natural: 'water', water: 'reservoir', 'name:en': 'Lake Tharthar', wikidata: 'Q99' },
    };
    const result = normalizeWaterElement(el, stressLookup);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(35.0);
    expect(result!.lng).toBe(45.0);
    expect(result!.facilityType).toBe('reservoir');
  });

  it('returns null for elements without tags', () => {
    const el = { type: 'node' as const, id: 1, lat: 33, lon: 44 };
    expect(normalizeWaterElement(el, stressLookup)).toBeNull();
  });

  it('returns null for unrecognized tags', () => {
    const el = {
      type: 'node' as const,
      id: 1,
      lat: 33,
      lon: 44,
      tags: { highway: 'primary' },
    };
    expect(normalizeWaterElement(el, stressLookup)).toBeNull();
  });

  it('returns null for elements without coordinates', () => {
    const el = {
      type: 'way' as const,
      id: 1,
      tags: { waterway: 'dam', name: 'Test Dam' },
    };
    expect(normalizeWaterElement(el, stressLookup)).toBeNull();
  });

  it('extracts operator from tags', () => {
    const el = {
      type: 'node' as const,
      id: 100,
      lat: 33.0,
      lon: 44.0,
      tags: {
        waterway: 'dam',
        name: 'Darbandikhan Dam',
        operator: 'Iraqi Ministry of Water Resources',
        wikidata: 'Q456',
      },
    };
    const result = normalizeWaterElement(el, stressLookup);
    expect(result).not.toBeNull();
    expect(result!.operator).toBe('Iraqi Ministry Of Water Resources');
  });

  // ---------- Tiered country filtering tests ----------

  describe('tiered country filtering', () => {
    // Priority country: Iraq (33.2, 43.7) — Phase 27.3.1 R-02 calibration
    // (Plan 04) tightens compound gate to TWO of (isNotable, isPriorityCountry,
    // hasCapacityData). Name-only in a priority country was admitting via the
    // single-signal OR; under the 2-of-3 rule the priority-country branch is
    // necessary but no longer sufficient on its own. A name-only Iraqi dam
    // now needs a second signal (wikidata, capacity, or operator-via-isNotable).
    it('keeps dam in priority country with wikidata (Iraq) — 2-of-3 admits via isNotable+priority', () => {
      const el = {
        type: 'node' as const,
        id: 200,
        lat: 33.2,
        lon: 43.7,
        tags: { waterway: 'dam', name: 'Iraqi Dam', wikidata: 'Q777' },
      };
      expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
    });

    it('rejects name-only dam in priority country (Iraq) — Phase 27.3.1 R-02 single-signal floodgate closed', () => {
      const el = {
        type: 'node' as const,
        id: 200,
        lat: 33.2,
        lon: 43.7,
        tags: { waterway: 'dam', name: 'Iraqi Dam' },
      };
      // Name + priority alone = 1 signal; needs 2 of (isNotable, isPriorityCountry, hasCapacityData).
      expect(normalizeWaterElement(el, stressLookup)).toBeNull();
    });

    // Non-priority country: Oman (21.5, 55.9) — Round 3 moved here since Saudi
    // Arabia joined PRIORITY_COUNTRIES.
    it('filters dam without name in non-priority country (Oman)', () => {
      const el = {
        type: 'node' as const,
        id: 300,
        lat: 21.5,
        lon: 55.9,
        tags: { waterway: 'dam' },
      };
      expect(normalizeWaterElement(el, stressLookup)).toBeNull();
    });

    it('keeps dam with wikidata + capacity in non-priority country (Oman) — Phase 27.3.1 R-02 2-of-3', () => {
      // Non-priority + wikidata + capacity = 2 of 3 signals; R-02 calibration
      // requires two notability signals so a wikidata-only admission in non-
      // priority countries (one signal) no longer admits.
      const el = {
        type: 'node' as const,
        id: 301,
        lat: 21.5,
        lon: 55.9,
        tags: { waterway: 'dam', name: 'Notable Omani Dam', wikidata: 'Q12345', volume: '500000' },
      };
      expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
    });

    it('rejects wikidata-only dam in non-priority country (Oman) — Phase 27.3.1 R-02 single-signal closed', () => {
      const el = {
        type: 'node' as const,
        id: 301,
        lat: 21.5,
        lon: 55.9,
        tags: { waterway: 'dam', name: 'Wikidata-only Omani Dam', wikidata: 'Q12345' },
      };
      // wikidata alone = 1 signal in non-priority country → not_notable.
      expect(normalizeWaterElement(el, stressLookup)).toBeNull();
    });

    // Round 3: REV-2 now admits any named reservoir (`isNotable || hasName`).
    // A named non-priority-country reservoir with no nearestCity within 150km
    // and no wiki ref still gets rejected, but now via the no_city gate (not
    // REV-2 not_notable). Oman deep-interior coordinates place the element
    // outside any CITY_DATA 150km radius, so the assertion holds.
    it('filters named reservoir in non-priority country when no nearestCity and no wiki (no_city)', () => {
      const el = {
        type: 'node' as const,
        id: 302,
        lat: 20.0,
        lon: 55.5, // Oman interior — no CITY_DATA entry within 150km
        tags: { natural: 'water', water: 'reservoir', name: 'Omani Reservoir' },
      };
      expect(normalizeWaterElement(el, stressLookup)).toBeNull();
    });

    // Phase 27.3.1 R-03 / D-06 REVERSAL: Round 3's Package A relaxation
    // (`isNotable || hasName` for reservoirs) admitted bare-named reservoirs
    // in non-priority countries on hasName alone. Plan 02's compound gate
    // restores a second-signal requirement — named-only is no longer enough
    // outside priority countries. This assertion flipped from `.not.toBeNull`
    // to `.toBeNull` with the D-06 gate landing.
    it('rejects named reservoir in non-priority country without wiki/capacity (Phase 27.3.1 D-06 reversal)', () => {
      const el = {
        type: 'node' as const,
        id: 312,
        // Near Muscat (23.588, 58.3829) so nearestCity enrichment resolves and
        // no_city does not fire.
        lat: 23.6,
        lon: 58.4,
        tags: { natural: 'water', water: 'reservoir', name: 'Muscat Hills Reservoir' },
      };
      // No wiki, no capacity, Oman is non-priority — compound gate rejects.
      expect(normalizeWaterElement(el, stressLookup)).toBeNull();
    });

    it('keeps reservoir with wikipedia + capacity in non-priority country (Oman) — Phase 27.3.1 R-02 2-of-3', () => {
      // wikipedia (isNotable) + capacity = 2 of 3 signals; R-02 calibration
      // requires two notability signals — wikipedia alone in a non-priority
      // country no longer admits.
      const el = {
        type: 'node' as const,
        id: 303,
        lat: 23.6,
        lon: 58.4,
        tags: {
          natural: 'water',
          water: 'reservoir',
          name: 'Notable Reservoir',
          wikipedia: 'en:Reservoir',
          volume: '1000000',
        },
      };
      expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
    });

    it('keeps desalination in non-priority country when score >= 15 (Round 3 floor) — Oman with wikidata', () => {
      const el = {
        type: 'node' as const,
        id: 305,
        lat: 23.6,
        lon: 58.4,
        tags: { man_made: 'desalination_plant', name: 'Omani Desalination', wikidata: 'Q99' },
      };
      expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
    });

    it('keeps reservoir with wikipedia:en in Egypt (now priority as of Round 3)', () => {
      const el = {
        type: 'node' as const,
        id: 306,
        lat: 26.8,
        lon: 30.8, // Egypt — now priority
        tags: {
          natural: 'water',
          water: 'reservoir',
          name: 'Aswan Reservoir',
          'wikipedia:en': 'Lake Nasser',
        },
      };
      expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
    });

    // Phase 27.3.1 R-02 calibration (Plan 04): Round 3's pure-name-in-priority
    // admission path is the floodgate that produced 1316 dams + 830 reservoirs
    // post-R-03 hardening. R-02 closes it by requiring TWO of three signals
    // (isNotable, isPriorityCountry, hasCapacityData). Round 3 regression
    // tests below now expect a SECOND signal alongside the priority-country
    // bonus to admit; the bare-name-in-priority versions are kept as
    // regression locks proving the new gate fires.
    // Phase 27.3.1 Plan 10 (G2): rewritten from pre-Plan-10 admit case.
    // Pre-Plan-10 a named Turkish reservoir with wikidata admitted via
    // Round 3's priority-country expansion. Plan 10 drops Turkey from
    // PRIORITY_COUNTRIES AND adds the `excluded_turkey` reject branch so
    // coordinates that resolve to Turkey via nearest-centroid (and that slip
    // past the geographic isExcludedLocation 600km rule) now always reject.
    //
    // Coord (39.5, 40.0) chosen because nearest-centroid is Turkey
    // (39.0, 35.2) at 417km; (37.9, 40.2) in the old test actually
    // resolves to Syria — the 600km-from-Diyarbakir geographic band
    // DOES include coordinates whose nearest centroid is a neighbor
    // (Syria here), so we need a coord that falls strictly inside
    // Turkey by centroid to exercise the new branch.
    it('Plan 10 G2 regression: Turkish named reservoir with wikidata rejects via excluded_turkey', () => {
      const rejections = {
        excluded_location: 0,
        excluded_turkey: 0,
        not_notable: 0,
        no_name: 0,
        duplicate: 0,
        low_score: 0,
        no_city: 0,
      };
      const el = {
        type: 'node' as const,
        id: 320,
        // Eastern-central Turkey (nearest centroid = Turkey; distFromSE
        // Diyarbakir ~179km so isExcludedLocation does not fire).
        lat: 39.5,
        lon: 40.0,
        tags: {
          natural: 'water',
          water: 'reservoir',
          name: 'Karakaya Baraj Gölü',
          wikidata: 'Q1234567',
        },
      };
      expect(normalizeWaterElement(el, stressLookup, rejections)).toBeNull();
      expect(rejections.excluded_turkey).toBe(1);
      // Not routed to not_notable / no_name — the Turkey branch fires first.
      expect(rejections.not_notable).toBe(0);
      expect(rejections.no_name).toBe(0);
    });

    it('Plan 10 G2: bare-named Turkish reservoir rejects via excluded_turkey (bucket changed from not_notable)', () => {
      const rejections = {
        excluded_location: 0,
        excluded_turkey: 0,
        not_notable: 0,
        no_name: 0,
        duplicate: 0,
        low_score: 0,
        no_city: 0,
      };
      const el = {
        type: 'node' as const,
        id: 321,
        lat: 39.5,
        lon: 40.0,
        tags: { natural: 'water', water: 'reservoir', name: 'Karakaya Baraj Gölü' },
      };
      expect(normalizeWaterElement(el, stressLookup, rejections)).toBeNull();
      // Pre-Plan-10 this hit not_notable (R-02 2-of-3 regression lock).
      // Plan 10 moves Turkey ahead of the compound gate so excluded_turkey fires.
      expect(rejections.excluded_turkey).toBe(1);
      expect(rejections.not_notable).toBe(0);
    });

    it('admits Egyptian named dam with capacity (operator alone is not a notability signal)', () => {
      // Phase 27.3.1 R-02: hasCapacityData (height) supplies the second signal
      // alongside isPriorityCountry. Pre-R-02 the operator-only Egypt entry
      // admitted via single-signal OR.
      const el = {
        type: 'node' as const,
        id: 321,
        lat: 26.8,
        lon: 30.8, // Egypt — priority
        tags: {
          waterway: 'dam',
          name: 'High Dam',
          operator: 'Egyptian Ministry of Water Resources',
          height: '111',
        },
      };
      expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
    });

    it('rejects Egyptian named dam with only operator (Phase 27.3.1 R-02 regression lock)', () => {
      const el = {
        type: 'node' as const,
        id: 321,
        lat: 26.8,
        lon: 30.8,
        tags: {
          waterway: 'dam',
          name: 'High Dam',
          operator: 'Egyptian Ministry of Water Resources',
        },
      };
      // operator is not part of isNotable / isPriorityCountry / hasCapacityData;
      // priority alone = 1 signal → rejected.
      expect(normalizeWaterElement(el, stressLookup)).toBeNull();
    });

    it('admits Saudi named reservoir with capacity (Phase 27.3.1 R-02 2-of-3)', () => {
      const el = {
        type: 'node' as const,
        id: 322,
        lat: 23.9,
        lon: 45.1, // Saudi Arabia — priority
        tags: {
          natural: 'water',
          water: 'reservoir',
          name: 'Najran Reservoir',
          volume: '50000000',
        },
      };
      expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
    });

    it('rejects bare-named Saudi reservoir (Phase 27.3.1 R-02 regression lock)', () => {
      const el = {
        type: 'node' as const,
        id: 322,
        lat: 23.9,
        lon: 45.1,
        tags: { natural: 'water', water: 'reservoir', name: 'Najran Reservoir' },
      };
      expect(normalizeWaterElement(el, stressLookup)).toBeNull();
    });
  });

  describe('unnamed facility labeling', () => {
    // Phase 27.3.1 Plan 10 (G1): rewritten from pre-Plan-10 admit case.
    // Pre-Plan-10 hasName shortcut via isNotable let a wikidata-only element
    // admit with a bare "Dam" fallback label — UAT Test 2 called those out
    // as noise ("Dam near X" after the reverse-geocoder). Plan 10 tightens
    // hasName to require real name/name:en/operator, so this element now
    // lands in the no_name bucket.
    it('Plan 10 G1 regression: wikidata-only element (no name tag) rejects with no_name bucket', () => {
      const rejections = {
        excluded_location: 0,
        excluded_turkey: 0,
        not_notable: 0,
        no_name: 0,
        duplicate: 0,
        low_score: 0,
        no_city: 0,
      };
      const el = {
        type: 'node' as const,
        id: 400,
        lat: 33.2,
        lon: 43.7, // Iraq (priority)
        tags: { waterway: 'dam', wikidata: 'Q999' }, // wikidata only — no name/name:en/operator
      };
      const result = normalizeWaterElement(el, stressLookup, rejections);
      expect(result).toBeNull();
      expect(rejections.no_name).toBe(1);
    });

    it('produces named label when OSM name tag exists', () => {
      const el = {
        type: 'node' as const,
        id: 401,
        lat: 33.2,
        lon: 43.7,
        // wikidata + priority country = 2 of 3 signals (Phase 27.3.1 R-02).
        tags: { waterway: 'dam', name: 'Haditha Dam', wikidata: 'Q12345' },
      };
      const result = normalizeWaterElement(el, stressLookup);
      expect(result).not.toBeNull();
      expect(result!.label).toBe('Haditha Dam');
    });

    it('uses name:en when present over non-Latin name', () => {
      const el = {
        type: 'node' as const,
        id: 402,
        lat: 32.6,
        lon: 51.7, // Iran (priority), near Isfahan so no_city rule doesn't reject
        tags: { man_made: 'desalination_plant', 'name:en': 'Isfahan Desalination Plant' },
      };
      const result = normalizeWaterElement(el, stressLookup);
      expect(result).not.toBeNull();
      expect(result!.label).toBe('Isfahan Desalination Plant');
    });
  });

  describe('no_city rejection rule (Phase 27.3 Plan 04)', () => {
    it('rejects a named reservoir in non-priority country with no nearestCity and no wikidata (Plan 05 scoping)', () => {
      // Plan 05 tightens no_city to reservoirs only AND exempts named priority-country
      // facilities. Round 3 moved Saudi Arabia into PRIORITY_COUNTRIES, so the
      // non-priority deep-interior case shifts to Oman (21.5, 55.9) / Oman
      // interior (20.0, 55.5). Muscat is the only Omani CITY_DATA entry and
      // sits ~400km away, so nearestCity does not resolve.
      const rejections = {
        excluded_location: 0,
        not_notable: 0,
        no_name: 0,
        duplicate: 0,
        low_score: 0,
        no_city: 0,
      };
      const el = {
        type: 'way' as const,
        id: 900,
        lat: 20.0,
        lon: 55.5, // Oman interior, non-priority
        tags: {
          natural: 'water',
          water: 'reservoir',
          name: 'Omani Interior Reservoir',
        },
      };
      const result = normalizeWaterElement(el, stressLookup, rejections);
      expect(result).toBeNull();
      // The Plan 05 target is no_city; under Round 3 relaxation REV-2 admits
      // (hasName), score clears MIN=15 (name-only = 15), and no_city fires.
      expect(
        rejections.no_city + rejections.low_score + rejections.not_notable,
      ).toBeGreaterThanOrEqual(1);
    });

    it('keeps a dam with wikidata tag even when nearestCity is null', () => {
      // Same remote Afghanistan coords, but this dam has wikidata so it's notable
      // on its own terms even without a nearby city.
      const rejections = {
        excluded_location: 0,
        not_notable: 0,
        no_name: 0,
        duplicate: 0,
        low_score: 0,
        no_city: 0,
      };
      const el = {
        type: 'node' as const,
        id: 901,
        lat: 34.0,
        lon: 62.0,
        tags: {
          waterway: 'dam',
          name: 'Remote Wikidata Dam',
          wikidata: 'Q12345',
        },
      };
      const result = normalizeWaterElement(el, stressLookup, rejections);
      expect(result).not.toBeNull();
      expect(result!.label).toBe('Remote Wikidata Dam');
      expect(rejections.no_city).toBe(0);
    });

    it('keeps a dam near a CITY_DATA entry (Tehran) — nearestCity resolves', () => {
      const rejections = {
        excluded_location: 0,
        not_notable: 0,
        no_name: 0,
        duplicate: 0,
        low_score: 0,
        no_city: 0,
      };
      const el = {
        type: 'node' as const,
        id: 902,
        lat: 35.7,
        lon: 51.4,
        // Phase 27.3.1 R-02: capacity supplies the 2nd signal alongside isPriorityCountry.
        tags: { waterway: 'dam', name: 'Near Tehran Dam', height: '85' },
      };
      const result = normalizeWaterElement(el, stressLookup, rejections);
      expect(result).not.toBeNull();
      expect(result!.nearestCity?.name).toBe('Tehran');
      expect(rejections.no_city).toBe(0);
    });
  });

  describe('no_city rule scoping (Phase 27.3 Plan 05)', () => {
    it('keeps a dam with no nearestCity and capacity (dams are exempt from no_city rule)', () => {
      // Western Afghanistan remote coordinates — pre-Plan-05 this would be rejected;
      // Plan 05 scopes the rule to reservoirs only.
      // Phase 27.3.1 R-02 calibration: name+priority alone is 1 signal under
      // the new 2-of-3 compound; capacity adds the second signal so the test
      // still validates the no_city scoping (the gate under test) rather than
      // tripping on the upstream compound gate.
      const rejections = {
        excluded_location: 0,
        not_notable: 0,
        no_name: 0,
        duplicate: 0,
        low_score: 0,
        no_city: 0,
      };
      const el = {
        type: 'node' as const,
        id: 910,
        lat: 34.0,
        lon: 62.0,
        tags: { waterway: 'dam', name: 'Remote Dam', height: '40' },
      };
      const result = normalizeWaterElement(el, stressLookup, rejections);
      expect(result).not.toBeNull();
      expect(result!.facilityType).toBe('dam');
      expect(rejections.no_city).toBe(0);
    });

    it('keeps a desalination facility with no nearestCity and no wikidata (desalination is exempt)', () => {
      // Remote UAE coast — far from any CITY_DATA entry. `operator` tag bumps
      // the notability score above MIN_NOTABILITY_SCORE so the no_city exemption
      // is the gate under test (not the low_score gate).
      const rejections = {
        excluded_location: 0,
        not_notable: 0,
        no_name: 0,
        duplicate: 0,
        low_score: 0,
        no_city: 0,
      };
      const el = {
        type: 'node' as const,
        id: 911,
        lat: 23.0,
        lon: 52.5,
        tags: {
          man_made: 'desalination_plant',
          name: 'Remote Desalination Plant',
          operator: 'ADNOC',
        },
      };
      const result = normalizeWaterElement(el, stressLookup, rejections);
      expect(result).not.toBeNull();
      expect(result!.facilityType).toBe('desalination');
      expect(rejections.no_city).toBe(0);
    });

    it('keeps a named reservoir in priority country with no nearestCity (named-priority exemption)', () => {
      // Western Afghanistan priority country — named reservoir per Plan 05
      // named-priority no_city exemption.
      // Phase 27.3.1 R-02 calibration: capacity adds the 2nd signal so the
      // upstream compound gate clears and this test isolates the no_city
      // named-priority exemption (the gate under test) rather than the
      // compound gate.
      const rejections = {
        excluded_location: 0,
        not_notable: 0,
        no_name: 0,
        duplicate: 0,
        low_score: 0,
        no_city: 0,
      };
      const el = {
        type: 'way' as const,
        id: 912,
        lat: 34.0,
        lon: 62.0,
        tags: {
          natural: 'water',
          water: 'reservoir',
          name: 'Hindu Kush Reservoir',
          volume: '5000000',
        },
      };
      const result = normalizeWaterElement(el, stressLookup, rejections);
      expect(result).not.toBeNull();
      expect(result!.facilityType).toBe('reservoir');
      expect(rejections.no_city).toBe(0);
    });
  });

  describe('classifyWaterType name-based dam override (Phase 27.3 Plan 05)', () => {
    it('reclassifies a reservoir-tagged element named "Hub Dam" as dam (UAT Test 8b)', () => {
      expect(classifyWaterType({ natural: 'water', water: 'reservoir', name: 'Hub Dam' })).toBe(
        'dam',
      );
    });

    it('reclassifies a landuse=reservoir element named "Atatürk Dam" as dam', () => {
      expect(classifyWaterType({ landuse: 'reservoir', name: 'Atatürk Dam' })).toBe('dam');
    });

    it('uses name:en over name when both present', () => {
      expect(
        classifyWaterType({
          natural: 'water',
          water: 'reservoir',
          name: 'Barrage de Tishrin',
          'name:en': 'Tishrin Dam',
        }),
      ).toBe('dam');
    });

    it('does NOT reclassify when name contains "dam" only as substring ("Damascus")', () => {
      expect(
        classifyWaterType({ natural: 'water', water: 'reservoir', name: 'Damascus Reservoir' }),
      ).toBe('reservoir');
    });

    it('leaves a dam-tagged element classified as dam even when name contains "dam"', () => {
      expect(classifyWaterType({ waterway: 'dam', name: 'Mosul Dam' })).toBe('dam');
    });

    it('leaves a desalination-tagged element alone regardless of name', () => {
      expect(classifyWaterType({ man_made: 'desalination_plant', name: 'Dam Desalination' })).toBe(
        'desalination',
      );
    });

    // ---- Regression tests for the reservoirs-missing-after-05 bug ----
    // Pre-fix `/\bdam\b/i` incorrectly reclassified reservoir impoundments
    // named after the dam that created them (e.g. "Mosul Dam Lake") as dams,
    // draining the reservoir population to zero. Fix: terminal-anchored
    // `/\bdam\s*$/i` so only "X Dam" (trailing token) reclassifies.

    it('does NOT reclassify "Mosul Dam Lake" (impoundment named after the dam)', () => {
      expect(
        classifyWaterType({ natural: 'water', water: 'reservoir', name: 'Mosul Dam Lake' }),
      ).toBe('reservoir');
    });

    it('does NOT reclassify "Tabqa Dam Reservoir" (impoundment suffix)', () => {
      expect(
        classifyWaterType({ natural: 'water', water: 'reservoir', name: 'Tabqa Dam Reservoir' }),
      ).toBe('reservoir');
    });

    it('does NOT reclassify "Atatürk Dam Reservoir" (landuse impoundment suffix)', () => {
      expect(classifyWaterType({ landuse: 'reservoir', name: 'Atatürk Dam Reservoir' })).toBe(
        'reservoir',
      );
    });

    it('does NOT reclassify "Karkheh Dam Water Supply" (dam-adjacent compound noun)', () => {
      expect(
        classifyWaterType({
          natural: 'water',
          water: 'reservoir',
          name: 'Karkheh Dam Water Supply',
        }),
      ).toBe('reservoir');
    });

    it('reclassifies "Hub Dam " with trailing whitespace (terminal anchor tolerates trim)', () => {
      expect(classifyWaterType({ natural: 'water', water: 'reservoir', name: 'Hub Dam ' })).toBe(
        'dam',
      );
    });
  });

  // Phase 27.3.1 R-03 — hasName mandatory + D-06 compound admission gate.
  // These tests cover D-05 (hasName is mandatory with no exceptions),
  // D-06 (hasName AND (isNotable || isPriorityCountry || hasCapacityData)),
  // and D-07 (unnamed-dam rejection extended to ALL countries — previously
  // only non-priority).
  describe('Phase 27.3.1 R-03 — hasName + compound gate', () => {
    const emptyRejections = () => ({
      excluded_location: 0,
      not_notable: 0,
      no_name: 0,
      duplicate: 0,
      low_score: 0,
      no_city: 0,
    });

    it('hasCapacityData returns true for height', () => {
      expect(hasCapacityData({ height: '85' })).toBe(true);
    });
    it('hasCapacityData returns true for volume', () => {
      expect(hasCapacityData({ volume: '1000000' })).toBe(true);
    });
    it('hasCapacityData returns true for capacity', () => {
      expect(hasCapacityData({ capacity: '500000' })).toBe(true);
    });
    it('hasCapacityData returns true for area', () => {
      expect(hasCapacityData({ area: '50000' })).toBe(true);
    });
    it('hasCapacityData returns false when all four keys absent', () => {
      expect(hasCapacityData({ name: 'X' })).toBe(false);
    });
    it('hasCapacityData returns false for empty string values', () => {
      expect(hasCapacityData({ height: '', volume: '  ' })).toBe(false);
    });

    it('D-05/D-07: rejects unnamed dam in priority country (was admitted pre-R-03)', () => {
      // Tehran-area dam with no name, no wiki, no capacity — priority country
      // path previously admitted unnamed dams here. Plan 02 closes that hole.
      const rejections = emptyRejections();
      const el = {
        type: 'node' as const,
        id: 1,
        lat: 35.7,
        lon: 51.4,
        tags: { waterway: 'dam' },
      };
      expect(normalizeWaterElement(el, stressLookup, rejections)).toBeNull();
      expect(rejections.no_name).toBe(1);
    });

    it('D-05: rejects unnamed desalination in priority country even with capacity', () => {
      // hasName is AND — capacity alone cannot substitute for a name.
      const rejections = emptyRejections();
      const el = {
        type: 'node' as const,
        id: 2,
        lat: 24.4,
        lon: 54.4,
        tags: { man_made: 'desalination_plant', capacity: '500000' },
      };
      expect(normalizeWaterElement(el, stressLookup, rejections)).toBeNull();
      expect(rejections.no_name).toBe(1);
    });

    it('D-06: admits named reservoir in non-priority country with wikidata + capacity (Phase 27.3.1 R-02 2-of-3)', () => {
      // Pakistan is non-priority. Phase 27.3.1 R-02 calibration tightened the
      // compound gate to require TWO of (isNotable, isPriorityCountry,
      // hasCapacityData). hasCapacityData alone in a non-priority country
      // (the Plan 02 admit-case) no longer admits — needs wikidata as the
      // second signal. Placed near Karachi so nearestCity resolves.
      const rejections = emptyRejections();
      const el = {
        type: 'node' as const,
        id: 3,
        lat: 25.0,
        lon: 67.2,
        tags: {
          natural: 'water',
          water: 'reservoir',
          name: 'Large Volume Reservoir',
          volume: '10000000',
          wikidata: 'Q12345',
        },
      };
      expect(normalizeWaterElement(el, stressLookup, rejections)).not.toBeNull();
    });

    it('rejects named reservoir in non-priority country with capacity-only (Phase 27.3.1 R-02 single-signal closed)', () => {
      const rejections = emptyRejections();
      const el = {
        type: 'node' as const,
        id: 3,
        lat: 25.0,
        lon: 67.2,
        tags: {
          natural: 'water',
          water: 'reservoir',
          name: 'Capacity-only Reservoir',
          volume: '10000000',
        },
      };
      expect(normalizeWaterElement(el, stressLookup, rejections)).toBeNull();
      expect(rejections.not_notable).toBe(1);
    });

    it('D-06: admits named reservoir in priority country with capacity (Phase 27.3.1 R-02 2-of-3)', () => {
      // Iran (priority) + named + capacity = 2 of 3 signals.
      // Phase 27.3.1 R-02: priority alone is no longer sufficient; the second
      // notability signal closes the priority-country flood (Iran 234 admits
      // pre-R-02). Near Tehran so nearestCity resolves.
      const rejections = emptyRejections();
      const el = {
        type: 'node' as const,
        id: 4,
        lat: 35.6,
        lon: 51.4,
        tags: {
          natural: 'water',
          water: 'reservoir',
          name: 'Local Reservoir',
          volume: '8000000',
        },
      };
      expect(normalizeWaterElement(el, stressLookup, rejections)).not.toBeNull();
    });

    it('rejects named reservoir in priority country WITHOUT a second signal (Phase 27.3.1 R-02 regression lock)', () => {
      const rejections = emptyRejections();
      const el = {
        type: 'node' as const,
        id: 4,
        lat: 35.6,
        lon: 51.4,
        tags: { natural: 'water', water: 'reservoir', name: 'Bare-Name Reservoir' },
      };
      // Priority alone = 1 signal; rejected as not_notable.
      expect(normalizeWaterElement(el, stressLookup, rejections)).toBeNull();
      expect(rejections.not_notable).toBe(1);
    });

    it('D-06: rejects named reservoir in non-priority country without wiki/capacity (Package A relaxation reverted)', () => {
      // Pakistan non-priority, near Karachi so no_city does not mask the test,
      // but no wiki and no capacity — compound gate rejects via not_notable.
      const rejections = emptyRejections();
      const el = {
        type: 'node' as const,
        id: 5,
        lat: 25.0,
        lon: 67.2,
        tags: {
          natural: 'water',
          water: 'reservoir',
          name: 'Nameless-ish Local Reservoir',
        },
      };
      expect(normalizeWaterElement(el, stressLookup, rejections)).toBeNull();
      expect(rejections.not_notable).toBe(1);
    });

    it('D-06: admits named desalination in priority country via priority branch', () => {
      const rejections = emptyRejections();
      const el = {
        type: 'node' as const,
        id: 6,
        lat: 24.4,
        lon: 54.4, // Abu Dhabi (UAE priority) — nearestCity resolves
        tags: { man_made: 'desalination_plant', name: 'Local Desal' },
      };
      expect(normalizeWaterElement(el, stressLookup, rejections)).not.toBeNull();
    });

    // Phase 27.3.1 R-02 calibration / Branch 2c — desalination exemption
    // tests. The R-02 calibration tightened the compound gate to 2-of-3
    // signals BUT exempted desalination because the post-R-03 admit count
    // was 6 (target 10-25). Sparse OSM coverage (~63 raw elements) makes
    // the name+type combination sufficient. These tests prove the exemption
    // admits a named desal anywhere in the bbox once hasName is satisfied.
    it('R-02 desalination exemption: admits named desalination in non-priority country with no wiki / no capacity', () => {
      // Bahrain (Khobar coords) actually resolves to Bahrain via nearest-centroid,
      // which is NOT in PRIORITY_COUNTRIES. Pre-R-02, this admitted via the
      // single-signal compound (hasCapacityData was the only signal). Now via
      // the R-02 desalination exemption: hasName is sufficient.
      const rejections = emptyRejections();
      const el = {
        type: 'node' as const,
        id: 8,
        lat: 26.18,
        lon: 50.21, // Khobar P&D — nearest centroid is Bahrain (non-priority)
        tags: { man_made: 'desalination_plant', name: 'Bahrain Desal' },
      };
      expect(normalizeWaterElement(el, stressLookup, rejections)).not.toBeNull();
      expect(rejections.not_notable).toBe(0);
    });

    it('R-02 desalination exemption: admits named desalination in non-priority country with operator-only signal', () => {
      const rejections = emptyRejections();
      const el = {
        type: 'node' as const,
        id: 9,
        lat: 21.5,
        lon: 39.117, // Jeddah — Saudi Arabia is priority but desal exemption applies anyway
        tags: { man_made: 'desalination_plant', name: 'Some Desal Plant', operator: 'SWCC' },
      };
      expect(normalizeWaterElement(el, stressLookup, rejections)).not.toBeNull();
    });

    it('R-02 desalination exemption: still rejects unnamed desalination (D-05 hasName remains mandatory)', () => {
      // Exemption only bypasses the compound gate — D-05 hasName floor stays.
      const rejections = emptyRejections();
      const el = {
        type: 'node' as const,
        id: 10,
        lat: 26.18,
        lon: 50.21,
        tags: { man_made: 'desalination_plant', capacity: '500000' },
      };
      expect(normalizeWaterElement(el, stressLookup, rejections)).toBeNull();
      expect(rejections.no_name).toBe(1);
    });

    it('truth 22 regression guard: priority-country-named reservoir with capacity still passes no_city rule', () => {
      // Remote Iranian coords far from any CITY_DATA city — named-priority
      // exemption (Plan 05) must still trigger so no_city does not fire.
      // Phase 27.3.1 R-02: capacity adds the 2nd compound signal so the test
      // exercises the no_city rule (Plan 05 / D-09) rather than tripping on
      // the upstream compound gate.
      const rejections = emptyRejections();
      const el = {
        type: 'node' as const,
        id: 7,
        lat: 30.0,
        lon: 55.0,
        tags: {
          natural: 'water',
          water: 'reservoir',
          name: 'Remote Iranian Reservoir',
          height: '60',
        },
      };
      expect(normalizeWaterElement(el, stressLookup, rejections)).not.toBeNull();
    });

    it('truth 23 regression guard: Hub Dam reclassification preserved', () => {
      // classifyWaterType tag-then-name override — "Hub Dam" tagged
      // landuse=reservoir reclassifies to dam.
      expect(classifyWaterType({ landuse: 'reservoir', name: 'Hub Dam' })).toBe('dam');
    });
  });
});

describe('FACILITY_TYPE_LABELS', () => {
  it('exports all three facility type labels', () => {
    expect(FACILITY_TYPE_LABELS).toEqual({
      dam: 'Dam',
      reservoir: 'Reservoir',
      desalination: 'Desalination Plant',
    });
  });
});

// ---------- Phase 27.3 new tests ----------

const stressLookup = () => ({
  bws_raw: 3.5,
  bws_score: 3.5,
  bws_label: 'High',
  drr_score: 2.0,
  gtd_score: 1.5,
  sev_score: 2.5,
  iav_score: 3.0,
  compositeHealth: 0.5,
});

describe('computeNotabilityScore (REV-1)', () => {
  it('scores high for wikidata + named + priority', () => {
    const score = computeNotabilityScore(
      { wikidata: 'Q123', name: 'Mosul Dam', 'name:en': 'Mosul Dam', operator: 'Iraq Gov' },
      'dam',
      true,
    );
    expect(score).toBeGreaterThanOrEqual(85);
  });
  it('scores low for unnamed non-priority', () => {
    expect(computeNotabilityScore({}, 'dam', false)).toBeLessThan(25);
  });
  it('desalination always gets +5 bonus', () => {
    expect(computeNotabilityScore({ name: 'Plant' }, 'desalination', false)).toBeGreaterThanOrEqual(
      20,
    );
  });
});

describe('extractCapacityTags', () => {
  it('extracts numeric height', () => {
    expect(extractCapacityTags({ height: '85' })).toEqual({ height: 85 });
  });
  it('strips unit suffixes', () => {
    expect(extractCapacityTags({ height: '85 m', volume: '1000000 m3' })).toEqual({
      height: 85,
      volume: 1000000,
    });
  });
  it('returns null when no capacity tags', () => {
    expect(extractCapacityTags({ name: 'Dam' })).toBeNull();
  });
  it('ignores fully non-numeric values', () => {
    expect(extractCapacityTags({ height: 'unknown' })).toBeNull();
  });
});

describe('findNearestCity', () => {
  it('finds Baghdad for coords near Baghdad', () => {
    // Use Baghdad city center coords (not Iraq country centroid)
    expect(findNearestCity(33.32, 44.37)?.name).toBe('Baghdad');
  });
  it('finds Tabqa for coords near Tabqa Dam (REV-1 expanded)', () => {
    expect(findNearestCity(35.84, 38.55)?.name).toBe('Tabqa');
  });
  it('returns null for remote coordinates', () => {
    expect(findNearestCity(0, 0)).toBeNull();
  });
});

describe('linkRiver with bbox optimization (REV-3)', () => {
  it('returns null for facility outside any river bbox', () => {
    expect(linkRiver(25.0, 55.0)).toBeNull();
  });
  it('RIVER_BBOXES has at least one entry', () => {
    expect(RIVER_BBOXES.length).toBeGreaterThan(0);
  });
  it('each river bbox has valid bounds', () => {
    for (const bbox of RIVER_BBOXES) {
      expect(bbox.minLat).toBeLessThanOrEqual(bbox.maxLat);
      expect(bbox.minLng).toBeLessThanOrEqual(bbox.maxLng);
      expect(bbox.vertices.length).toBeGreaterThan(0);
    }
  });
});

describe('reservoir filtering (REV-2 wikidata fallback)', () => {
  it('keeps named reservoir in priority country with capacity (Phase 27.3.1 R-02 2-of-3)', () => {
    // REV-2's pure-name-in-priority admission was tightened by R-02 to require
    // a second signal alongside isPriorityCountry. Capacity supplies it here
    // so the REV-2 fallback (no wikidata) still admits via the compound gate.
    const el = {
      type: 'node' as const,
      id: 700,
      lat: 33.2,
      lon: 43.7,
      tags: {
        natural: 'water',
        water: 'reservoir',
        name: 'Tharthar Lake',
        area: '2710000000',
      },
    };
    expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
  });
  it('rejects unnamed reservoir even in priority country', () => {
    const el = {
      type: 'node' as const,
      id: 701,
      lat: 33.2,
      lon: 43.7,
      tags: { natural: 'water', water: 'reservoir' },
    };
    expect(normalizeWaterElement(el, stressLookup)).toBeNull();
  });
});

describe('holistic filtering (REV-1)', () => {
  // Round 3 (reservoirs-missing-after-05) — MIN_NOTABILITY_SCORE dropped from
  // 25 to 15 and PRIORITY_COUNTRIES expanded to include Saudi Arabia. The old
  // test used an unnamed Saudi dam which now scores 15 (priority bonus) and
  // passes the floor; reshaped here to a case that genuinely lands in the
  // low_score rejection bucket: an unnamed desalination plant in a non-priority
  // country scores only 5 (desalination bonus) and is rejected.
  it('rejects facility with score below MIN_NOTABILITY_SCORE (unnamed desalination in Oman)', () => {
    const el = {
      type: 'node' as const,
      id: 800,
      lat: 21.5,
      lon: 55.9, // Oman, non-priority
      tags: { man_made: 'desalination_plant' }, // No name/wikidata/operator — score = 5 (desal only)
    };
    expect(normalizeWaterElement(el, stressLookup)).toBeNull();
  });
});

describe('normalized facility includes notabilityScore', () => {
  it('attaches notabilityScore to passing facilities', () => {
    const el = {
      type: 'node' as const,
      id: 900,
      lat: 33.2,
      lon: 43.7,
      tags: { waterway: 'dam', name: 'Test Dam', operator: 'Iraq', wikidata: 'Q1' },
    };
    const result = normalizeWaterElement(el, stressLookup);
    expect(result?.notabilityScore).toBeGreaterThanOrEqual(70);
  });
});

// ---------- Phase 27.3.1 R-08 stats population tests ----------

// Intentional mid-file import — vi.mock setup for the R-08 test block must
// run AFTER the test fixtures defined above so the mock targets the correct
// module identity in the resolver chain. Mid-file `import` is hoisted by
// Node's ES module loader regardless of textual position.
// eslint-disable-next-line import/order
import { vi, beforeEach, afterEach } from 'vitest';

/**
 * Build an Overpass-style success response for a single facility-type query.
 * Each fixture element is a minimal valid OSM tag set that will admit through
 * the D-05/D-06 compound gate (named + priority country) so byCountry tallies
 * non-zero entries.
 */
function overpassSuccess(elements: unknown[]): Response {
  return new Response(JSON.stringify({ elements }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function overpassError(status: number): Response {
  return new Response('upstream error', { status });
}

describe('Phase 27.3.1 R-08 — nearestCountryName helper', () => {
  it('returns "Iran" for Tehran coordinates', () => {
    expect(nearestCountryName(35.7, 51.4)).toBe('Iran');
  });
  it('returns "Turkey" for Ankara coordinates', () => {
    expect(nearestCountryName(39.9, 32.9)).toBe('Turkey');
  });
  it('returns "Saudi Arabia" for Riyadh coordinates', () => {
    expect(nearestCountryName(24.7, 46.7)).toBe('Saudi Arabia');
  });
  it('returns "Iraq" for Baghdad coordinates', () => {
    expect(nearestCountryName(33.3, 44.4)).toBe('Iraq');
  });
});

describe('Phase 27.3.1 R-08 — fetchWaterFacilities stats population', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Iran-area dam with name + capacity → admits through D-05/D-06.
  const iranDam = {
    type: 'node',
    id: 1001,
    lat: 35.7,
    lon: 51.4,
    tags: { waterway: 'dam', name: 'Tehran Test Dam', volume: '1000000' },
  };
  // Turkey-area reservoir with name + capacity.
  // Coords (39.5, 40.0) chosen so:
  //  - nearest-centroid resolves to Turkey (39.0, 35.2) at ~417km
  //  - distFromSE (Diyarbakir 37.9, 40.2) is ~179km, well under the 600km
  //    western-Turkey exclusion cap
  // Phase 27.3.1 Plan 10 (G2): Turkey now rejects via the `excluded_turkey`
  // bucket in computeAdmissionDecision — the branch fires BEFORE the hasName
  // + compound-gate checks. Used below as the regression-lock fixture that
  // proves Turkey admits are blocked and the bucket is populated.
  const turkeyReservoir = {
    type: 'node',
    id: 1002,
    lat: 39.5,
    lon: 40.0,
    tags: {
      natural: 'water',
      water: 'reservoir',
      name: 'East Turkey Test Reservoir',
      volume: '5000000',
    },
  };
  // Iran-area unnamed dam → rejected by D-05 (no_name) → byTypeRejections increments.
  const unnamedIranDam = {
    type: 'node',
    id: 1003,
    lat: 35.7,
    lon: 51.4,
    tags: { waterway: 'dam' },
  };
  // Saudi-area named reservoir with capacity → priority + capacity = 2 of 3
  // (Phase 27.3.1 R-02 calibration; bare-name no longer admits in priority).
  const saudiReservoir = {
    type: 'node',
    id: 1004,
    lat: 24.7,
    lon: 46.7,
    tags: {
      natural: 'water',
      water: 'reservoir',
      name: 'Riyadh Test Reservoir',
      area: '1000000',
    },
  };
  // Iran desalination with name, near Tehran for nearestCity resolution.
  const iranDesal = {
    type: 'node',
    id: 1005,
    lat: 35.7,
    lon: 51.4,
    tags: { man_made: 'desalination_plant', name: 'Tehran Desal' },
  };
  // Reservoir without name → no_name rejection (counts toward reservoirs bucket).
  const unnamedReservoir = {
    type: 'node',
    id: 1006,
    lat: 35.7,
    lon: 51.4,
    tags: { natural: 'water', water: 'reservoir' },
  };

  it('source is "overpass" and generatedAt is ISO 8601 after a successful fetch', async () => {
    fetchMock
      .mockResolvedValueOnce(overpassSuccess([iranDam])) // dams
      .mockResolvedValueOnce(overpassSuccess([turkeyReservoir])) // reservoirs
      .mockResolvedValueOnce(overpassSuccess([iranDesal])); // desalination

    const { stats } = await fetchWaterFacilities();
    expect(stats.source).toBe('overpass');
    // Round-trip through Date → ISO succeeds for valid ISO strings.
    expect(() => new Date(stats.generatedAt).toISOString()).not.toThrow();
    expect(stats.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('overpass[] records one entry per query on primary success', async () => {
    fetchMock
      .mockResolvedValueOnce(overpassSuccess([iranDam]))
      .mockResolvedValueOnce(overpassSuccess([turkeyReservoir]))
      .mockResolvedValueOnce(overpassSuccess([iranDesal]));

    const { stats } = await fetchWaterFacilities();
    expect(stats.overpass.length).toBe(3);
    expect(stats.overpass.every((r) => r.mirror === 'primary')).toBe(true);
    expect(stats.overpass.every((r) => r.ok === true)).toBe(true);
    expect(stats.overpass.every((r) => r.attempts === 1)).toBe(true);
    expect(stats.overpass.every((r) => r.status === 200)).toBe(true);
    expect(stats.overpass.every((r) => typeof r.durationMs === 'number')).toBe(true);
  });

  it('overpass[] records fallback attempt when primary fails', async () => {
    fetchMock
      // dams: primary fails 503, fallback succeeds
      .mockResolvedValueOnce(overpassError(503))
      .mockResolvedValueOnce(overpassSuccess([iranDam]))
      // reservoirs: primary success
      .mockResolvedValueOnce(overpassSuccess([turkeyReservoir]))
      // desalination: primary success
      .mockResolvedValueOnce(overpassSuccess([iranDesal]));

    const { stats } = await fetchWaterFacilities();
    const damsRecords = stats.overpass.filter((r) => r.facilityType === 'dams');
    expect(damsRecords.length).toBe(2);
    expect(damsRecords[0]).toMatchObject({ mirror: 'primary', ok: false, attempts: 1 });
    expect(damsRecords[1]).toMatchObject({ mirror: 'fallback', ok: true, attempts: 2 });
    // Other types still produce one primary-success entry each
    expect(stats.overpass.filter((r) => r.facilityType === 'reservoirs').length).toBe(1);
    expect(stats.overpass.filter((r) => r.facilityType === 'desalination').length).toBe(1);
  });

  it('byCountry tallies admitted facilities per country (Turkey excluded via Plan 10 G2)', async () => {
    // 1 Iran dam + 1 Turkey reservoir + 1 Saudi reservoir + 1 Iran desal.
    // Phase 27.3.1 Plan 10 G2: turkeyReservoir is the regression-lock fixture.
    // It passes through the Overpass mock, gets normalized, then rejects via
    // the excluded_turkey branch in computeAdmissionDecision — byCountry
    // should NOT include a Turkey entry, and the excluded_turkey bucket
    // should register the reject.
    fetchMock
      .mockResolvedValueOnce(overpassSuccess([iranDam]))
      .mockResolvedValueOnce(overpassSuccess([turkeyReservoir, saudiReservoir]))
      .mockResolvedValueOnce(overpassSuccess([iranDesal]));

    const { stats } = await fetchWaterFacilities();
    expect(stats.byCountry.Iran).toEqual(expect.objectContaining({ dam: 1, desalination: 1 }));
    expect(stats.byCountry['Saudi Arabia']).toEqual(expect.objectContaining({ reservoir: 1 }));
    // Plan 10 G2: Turkey must not appear in byCountry admits.
    expect(stats.byCountry.Turkey).toBeUndefined();
    // excluded_turkey fires on the Turkish reservoir.
    expect(stats.rejections.excluded_turkey).toBe(1);
    expect(stats.byTypeRejections.reservoirs?.excluded_turkey).toBe(1);
  });

  it('byTypeRejections increments per-query buckets in lock-step with summed rejections', async () => {
    // dams query: 1 admitted (iranDam) + 1 unnamed (unnamedIranDam → no_name)
    // reservoirs query: 1 admitted (turkeyReservoir) + 1 unnamed (unnamedReservoir → no_name)
    // desalination query: 1 admitted (iranDesal)
    fetchMock
      .mockResolvedValueOnce(overpassSuccess([iranDam, unnamedIranDam]))
      .mockResolvedValueOnce(overpassSuccess([turkeyReservoir, unnamedReservoir]))
      .mockResolvedValueOnce(overpassSuccess([iranDesal]));

    const { stats } = await fetchWaterFacilities();
    expect(stats.byTypeRejections.dams?.no_name).toBe(1);
    expect(stats.byTypeRejections.reservoirs?.no_name).toBe(1);
    // Summed rejections matches per-type sum
    expect(stats.rejections.no_name).toBe(2);
  });

  it('byTypeRejections initializes a bucket for every facility-type query', async () => {
    fetchMock
      .mockResolvedValueOnce(overpassSuccess([iranDam]))
      .mockResolvedValueOnce(overpassSuccess([turkeyReservoir]))
      .mockResolvedValueOnce(overpassSuccess([iranDesal]));

    const { stats } = await fetchWaterFacilities();
    // Every FACILITY_QUERIES label gets its own per-type bucket, even when zero rejections.
    expect(Object.keys(stats.byTypeRejections).sort()).toEqual([
      'dams',
      'desalination',
      'reservoirs',
    ]);
    expect(stats.byTypeRejections.dams?.excluded_location).toBe(0);
    expect(stats.byTypeRejections.dams?.no_name).toBe(0);
  });
});

// ---------- Phase 27.3.1 R-06 D-20 — computeAdmissionDecision unit tests ----------
//
// Pure-function tests for the extracted admission helper. These call the
// decision function directly (bypassing normalizeWaterElement) to prove the
// decision ordering, bucket mapping, and desalination exemption match the
// pre-refactor scattered-branch behavior exactly. Serve as an observability
// contract: any future regression in the admission logic surfaces here
// before it shows up in normalizeWaterElement / fetchWaterFacilities tests.

describe('Phase 27.3.1 R-06 — computeAdmissionDecision', () => {
  // Helpers to build a nearestCity result in the admit-path tests without
  // duplicating findNearestCity plumbing.
  const withCity = (name: string, distanceKm = 50, population = 1_000_000) => ({
    name,
    distanceKm,
    population,
  });

  it('rejects excluded location (western Turkey) with excluded_location bucket', () => {
    // Istanbul (41.0, 28.9) — >600km from Diyarbakir, excluded by isExcludedLocation.
    const d = computeAdmissionDecision(
      { name: 'Ataturk Dam', waterway: 'dam' },
      41.0,
      28.9,
      'dam',
      false,
      50,
      null,
    );
    expect(d).toEqual({ verdict: 'reject', bucket: 'excluded_location' });
  });

  it('excluded_location fires even when hasName / wiki / capacity all present', () => {
    // Confirms ordering: excluded_location is the first gate.
    const d = computeAdmissionDecision(
      { name: 'X', waterway: 'dam', wikidata: 'Q1', height: '50' },
      41.0,
      28.9,
      'dam',
      false,
      80,
      withCity('Istanbul'),
    );
    expect(d.verdict).toBe('reject');
    if (d.verdict === 'reject') expect(d.bucket).toBe('excluded_location');
  });

  it('rejects unnamed facility with no_name bucket', () => {
    // Iran priority-country dam with no name — hasName gate.
    const d = computeAdmissionDecision({ waterway: 'dam' }, 35.7, 51.4, 'dam', true, 15, null);
    expect(d).toEqual({ verdict: 'reject', bucket: 'no_name' });
  });

  it('no_name fires even for desalination (D-05 hasName applies to all types)', () => {
    // Desal is exempt from compound but NOT from hasName.
    const d = computeAdmissionDecision(
      { man_made: 'desalination_plant', capacity: '500000' },
      24.4,
      54.4,
      'desalination',
      true,
      20,
      withCity('Abu Dhabi'),
    );
    expect(d).toEqual({ verdict: 'reject', bucket: 'no_name' });
  });

  it('rejects named non-priority non-wiki non-capacity dam with not_notable bucket (2-of-3 compound)', () => {
    // Oman (non-priority) + hasName + no wiki + no capacity = 1 signal → not_notable.
    const d = computeAdmissionDecision(
      { name: 'Local Dam', waterway: 'dam' },
      21.5,
      55.9,
      'dam',
      false,
      15,
      null,
    );
    expect(d).toEqual({ verdict: 'reject', bucket: 'not_notable' });
  });

  it('rejects named reservoir with only priority signal (Plan 04 floodgate closed)', () => {
    // Priority alone = 1 signal under 2-of-3; canonical R-02 regression lock.
    const d = computeAdmissionDecision(
      { name: 'Iraqi Reservoir', natural: 'water', water: 'reservoir' },
      33.2,
      43.7,
      'reservoir',
      true,
      30,
      withCity('Baghdad'),
    );
    expect(d).toEqual({ verdict: 'reject', bucket: 'not_notable' });
  });

  it('desalination exemption: admits named desal with only priority signal (Plan 04 Branch 2c)', () => {
    // The 2-of-3 compound check is skipped entirely for facilityType='desalination'.
    const d = computeAdmissionDecision(
      { name: 'Jeddah Desal', man_made: 'desalination_plant' },
      21.5,
      39.1,
      'desalination',
      true,
      20,
      withCity('Jeddah'),
    );
    expect(d).toEqual({ verdict: 'admit' });
  });

  it('desalination exemption: admits named desal even in non-priority country with no other signals', () => {
    // Bahrain (nearest-centroid non-priority) + hasName alone is sufficient for desal.
    const d = computeAdmissionDecision(
      { name: 'Bahrain Desal', man_made: 'desalination_plant' },
      26.18,
      50.21,
      'desalination',
      false,
      15,
      withCity('Manama', 20, 600_000),
    );
    expect(d).toEqual({ verdict: 'admit' });
  });

  it('rejects low score with low_score bucket (secondary floor past compound gate)', () => {
    // Fabricated: compound satisfied via isNotable (wikidata) + priority = 2 signals,
    // but score injected below MIN_NOTABILITY_SCORE. Real scorer never produces
    // this — it's a regression lock on the secondary gate.
    const d = computeAdmissionDecision(
      { name: 'X', wikidata: 'Q1', waterway: 'dam' },
      35.7,
      51.4,
      'dam',
      true,
      10,
      withCity('Tehran'),
    );
    expect(d).toEqual({ verdict: 'reject', bucket: 'low_score' });
  });

  // Note on the no_city verdict path under the Plan 04 2-of-3 gate:
  //   The compound gate requires two of (isNotable, inPriority, hasCapacityData).
  //   `no_city` only fires when !hasWikiRef && !isNamedInPriorityCountry for a
  //   reservoir with no nearestCity. Under 2-of-3:
  //     - non-priority + hasCapacityData alone = 1 signal → rejects not_notable
  //     - priority + hasCapacityData = 2 signals, but isNamedInPriorityCountry=true
  //       (we passed no_name, hasName was required), exempting no_city
  //     - isNotable=true → hasWikiRef=true, exempting no_city
  //   So the no_city branch is effectively unreachable from the compound-gate
  //   path post-Plan-04. It is retained as a defense-in-depth sentinel — a
  //   regression that re-introduces a no_city-reachable admission path would
  //   surface here as the bucket firing. The exemption tests below prove the
  //   branch is correctly bypassed in every reachable case.

  it('no_city is bypassed for named priority-country reservoirs (Plan 27.3-05 exemption)', () => {
    // Priority country + named reservoir + capacity (2nd signal) = past compound.
    // No nearestCity, no wiki, but isNamedInPriorityCountry=true → exempt → admit.
    const d = computeAdmissionDecision(
      { name: 'Remote Iranian Reservoir', natural: 'water', water: 'reservoir', height: '60' },
      30.0,
      55.0,
      'reservoir',
      true,
      30,
      null,
    );
    expect(d).toEqual({ verdict: 'admit' });
  });

  it('no_city rule is scoped to reservoir only (Plan 27.3-05 scoping) — dams with no city admit', () => {
    // Dam + priority + capacity (2nd signal) = past compound. No nearestCity, no
    // wiki — but facilityType='dam' means the reservoir-scoped no_city gate
    // does not apply.
    const d = computeAdmissionDecision(
      { name: 'Remote Dam', waterway: 'dam', height: '40' },
      30.0,
      55.0,
      'dam',
      true,
      40,
      null,
    );
    expect(d).toEqual({ verdict: 'admit' });
  });

  it('no_city rule is scoped to reservoir only — desalination with no city admits via desal exemption', () => {
    // Desalination + priority + no city = admits via desalination exemption,
    // confirming no_city is reservoir-only (not just "not dam").
    const d = computeAdmissionDecision(
      { name: 'Remote Desal', man_made: 'desalination_plant' },
      23.0,
      52.5,
      'desalination',
      true,
      20,
      null,
    );
    expect(d).toEqual({ verdict: 'admit' });
  });

  it('no_city is bypassed for named priority-country reservoirs (Plan 27.3-05 exemption)', () => {
    // Priority country + named reservoir + capacity (2nd signal) = past compound.
    // No nearestCity, no wiki, but isNamedInPriorityCountry=true → exempt → admit.
    const d = computeAdmissionDecision(
      { name: 'Remote Iranian Reservoir', natural: 'water', water: 'reservoir', height: '60' },
      30.0,
      55.0,
      'reservoir',
      true,
      30,
      null,
    );
    expect(d).toEqual({ verdict: 'admit' });
  });

  it('no_city is bypassed for wiki-backed reservoirs (hasWikiRef exemption)', () => {
    // Non-priority + wikidata (isNotable 1st signal) + hasCapacityData (2nd) = 2-of-3.
    // No nearestCity but hasWikiRef=true → exempt → admit.
    const d = computeAdmissionDecision(
      {
        name: 'Wiki-Backed Reservoir',
        natural: 'water',
        water: 'reservoir',
        wikidata: 'Q99',
        volume: '1000000',
      },
      30.0,
      68.0,
      'reservoir',
      false,
      70,
      null,
    );
    expect(d).toEqual({ verdict: 'admit' });
  });

  it('admits a fully-qualified facility (Mosul Dam class)', () => {
    // Priority + wiki + capacity + nearestCity — all gates clear.
    const d = computeAdmissionDecision(
      { name: 'Mosul Dam', waterway: 'dam', wikidata: 'Q1', height: '131' },
      36.6,
      42.8,
      'dam',
      true,
      90,
      withCity('Mosul', 50, 1_800_000),
    );
    expect(d).toEqual({ verdict: 'admit' });
  });

  it('admits a 2-of-3 dam (priority + capacity, no wiki)', () => {
    // Exercises the R-02 admit path that Plan 04 preserved.
    const d = computeAdmissionDecision(
      { name: 'Near Tehran Dam', waterway: 'dam', height: '85' },
      35.7,
      51.4,
      'dam',
      true,
      40,
      withCity('Tehran', 30, 9_000_000),
    );
    expect(d).toEqual({ verdict: 'admit' });
  });

  it('admits a 2-of-3 reservoir (wiki + capacity in non-priority country)', () => {
    // Pakistan non-priority; wikipedia via isNotable + capacity = 2-of-3.
    const d = computeAdmissionDecision(
      {
        name: 'Notable Reservoir',
        natural: 'water',
        water: 'reservoir',
        wikipedia: 'en:Reservoir',
        volume: '1000000',
      },
      25.0,
      67.2,
      'reservoir',
      false,
      65,
      withCity('Karachi', 40, 16_000_000),
    );
    expect(d).toEqual({ verdict: 'admit' });
  });

  it('decision ordering: no_name takes precedence over not_notable / low_score / no_city', () => {
    // Unnamed reservoir with no signals, low score, no city — all downstream gates
    // would reject, but no_name should fire first.
    const d = computeAdmissionDecision(
      { natural: 'water', water: 'reservoir' },
      30.0,
      68.0,
      'reservoir',
      false,
      5,
      null,
    );
    expect(d).toEqual({ verdict: 'reject', bucket: 'no_name' });
  });

  it('decision ordering: not_notable takes precedence over low_score / no_city', () => {
    // Named + no signals (non-priority, no wiki, no capacity) = 0 signals.
    // Score 10 would fail low_score, no city would fail no_city — but 2-of-3
    // should reject first with not_notable.
    const d = computeAdmissionDecision(
      { name: 'X', natural: 'water', water: 'reservoir' },
      30.0,
      68.0,
      'reservoir',
      false,
      10,
      null,
    );
    expect(d).toEqual({ verdict: 'reject', bucket: 'not_notable' });
  });
});

// ---------- Phase 27.3.2 admission tightening — no_resolved_name + desal synthesis ----------
//
// Phase 27.3.2 extended computeAdmissionDecision (Plan 04) and extractLabel
// (Plan 05) with two coordinated changes:
//
//   Plan 04 (admission, step 3b):
//     Non-desal facilities whose OSM tags fail `hasLatinLabel` now reject to
//     the new `no_resolved_name` bucket — inserted strictly between the
//     existing `no_name` (step 3) and `not_notable` (step 4) gates.
//     Desalination is unconditionally exempt per D-03 (sparse OSM coverage).
//     D-02 "river-rescue kill": `linkedRiver` is NO LONGER consulted at
//     admission — it remains only as post-admission enrichment.
//
//   Plan 05 (extractLabel, desal-only synthesis branches 4 + 5):
//     extractLabel grew from 2 args to 5 args — (tags, facilityType, lat, lng,
//     nearestCity). When a desal passes admission without a Latin name, the
//     label is synthesized server-side:
//       - branch 4: `Desalination Plant near ${nearestCity.name}` when a
//         nearestCity resolved.
//       - branch 5: `Desalination Plant at ${|lat|}°N/S, ${|lng|}°E/W`
//         byte-identical to src/lib/waterLabel.ts lines 87-89 pre-Plan-07.
//
// Tests below cover D-16:
//   1-2. Non-desal dam admission behavior (Latin name:en vs Persian-only name).
//   3.   D-02 river-rescue kill — non-Latin reservoir with river proximity
//        still rejects (linkedRiver is irrelevant to admission now).
//   4-5. Desal synthesis branches — non-Latin name admits, label synthesized
//        by coord (no nearestCity) or city (nearestCity=Jeddah). Cases 4+5
//        also invoke normalizeWaterElement to assert the exact synthesized
//        label string (route-through path per PATTERNS.md Pattern 3 note).
//   6-7. Ordering locks — no_name beats no_resolved_name (empty tags win),
//        and no_resolved_name beats not_notable (non-Latin tag beats the
//        compound gate even when the compound would also have rejected).

describe('Phase 27.3.2 admission tightening — no_resolved_name + desal synthesis', () => {
  // Helper to build a nearestCity result without duplicating findNearestCity
  // plumbing — matches the shape used in the Phase 27.3.1 R-06 block above.
  const withCity = (name: string, distanceKm = 50, population = 1_000_000) => ({
    name,
    distanceKm,
    population,
  });

  // Shared mock stress lookup for normalizeWaterElement routes (cases 4 + 5).
  const mockStress: WaterStressIndicators = {
    bws_raw: 3.5,
    bws_score: 3.5,
    bws_label: 'High',
    drr_score: 2.0,
    gtd_score: 1.5,
    sev_score: 2.5,
    iav_score: 3.0,
    compositeHealth: 0.5,
  };
  const stressLookup = () => mockStress;

  // D-16 case 1: non-desal dam with Latin name:en → admits.
  it('admits non-desal dam with Latin name:en', () => {
    const d = computeAdmissionDecision(
      { name: 'Karkheh', 'name:en': 'Karkheh Dam', waterway: 'dam', wikidata: 'Q1' },
      32.0,
      48.1,
      'dam',
      true,
      60,
      withCity('Ahvaz'),
    );
    expect(d).toEqual({ verdict: 'admit' });
  });

  // D-16 case 2: non-desal dam with Persian-only name → rejects to no_resolved_name.
  it('rejects non-desal dam with Persian-only name to no_resolved_name', () => {
    const d = computeAdmissionDecision(
      { name: 'سد کرخه', waterway: 'dam', wikidata: 'Q1' },
      32.0,
      48.1,
      'dam',
      true,
      60,
      withCity('Ahvaz'),
    );
    expect(d).toEqual({ verdict: 'reject', bucket: 'no_resolved_name' });
  });

  // D-16 case 3: D-02 river-rescue kill verification — reservoir with non-Latin
  // name near the Tigris would previously have been rescued via linkedRiver.
  // Plan 04 cemented the kill: linkedRiver is not consulted at admission, so
  // the Latin-label check rejects regardless of river proximity.
  it('rejects non-Latin reservoir even when linkedRiver would have resolved (D-02 kill)', () => {
    const d = computeAdmissionDecision(
      { name: 'خزان دجلة', natural: 'water', water: 'reservoir', wikidata: 'Q2' },
      34.6,
      43.8,
      'reservoir',
      true,
      50,
      withCity('Mosul'),
    );
    expect(d).toEqual({ verdict: 'reject', bucket: 'no_resolved_name' });
  });

  // D-16 case 4: desal with non-Latin name + no nearestCity → admits, coord synthesis.
  // (22.5, 37.5) is offshore Red Sea — no CITY_DATA entry within 150km, so
  // findNearestCity returns null and branch 5 of extractLabel fires.
  it('admits desal with non-Latin name and no nearestCity (coord synthesis)', () => {
    const d = computeAdmissionDecision(
      { name: 'محطة تحلية', man_made: 'desalination_plant' },
      22.5,
      37.5,
      'desalination',
      false,
      20,
      null,
    );
    expect(d).toEqual({ verdict: 'admit' });

    // Route through normalizeWaterElement to exercise the Plan 05 coord
    // synthesis branch (extractLabel branch 5) and assert the exact label
    // string — byte-identical format to src/lib/waterLabel.ts pre-Plan-07.
    const el = {
      type: 'node' as const,
      id: 9001,
      lat: 22.5,
      lon: 37.5,
      tags: { name: 'محطة تحلية', man_made: 'desalination_plant' },
    };
    const result = normalizeWaterElement(el, stressLookup);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Desalination Plant at 22.50°N, 37.50°E');
    expect(result!.facilityType).toBe('desalination');
  });

  // D-16 case 5: desal with non-Latin name + Jeddah nearestCity → admits, city synthesis.
  // (21.5, 39.1) is ~5km from Jeddah (21.4858, 39.1925) in CITY_DATA, so
  // findNearestCity returns Jeddah and branch 4 of extractLabel fires.
  it('admits desal with non-Latin name and nearestCity=Jeddah (city synthesis)', () => {
    const d = computeAdmissionDecision(
      { name: 'محطة جدة', man_made: 'desalination_plant' },
      21.5,
      39.1,
      'desalination',
      true,
      20,
      withCity('Jeddah'),
    );
    expect(d).toEqual({ verdict: 'admit' });

    // Route through normalizeWaterElement to exercise the Plan 05 city
    // synthesis branch (extractLabel branch 4) and assert the exact label
    // string — "Desalination Plant near {city}".
    const el = {
      type: 'node' as const,
      id: 9002,
      lat: 21.5,
      lon: 39.1,
      tags: { name: 'محطة جدة', man_made: 'desalination_plant' },
    };
    const result = normalizeWaterElement(el, stressLookup);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Desalination Plant near Jeddah');
    expect(result!.facilityType).toBe('desalination');
  });

  // Ordering lock 1: no_name fires before no_resolved_name when tags are empty.
  // hasName at step 3 must short-circuit before step 3b is reached.
  it('no_name fires before no_resolved_name (missing tags wins)', () => {
    const d = computeAdmissionDecision({ waterway: 'dam' }, 35.7, 51.4, 'dam', true, 15, null);
    expect(d).toEqual({ verdict: 'reject', bucket: 'no_name' });
  });

  // Ordering lock 2: no_resolved_name fires before not_notable when the facility
  // has a non-Latin name in a non-priority country with no other signals (would
  // also fail the compound gate at step 4). Step 3b must fire first.
  it('no_resolved_name fires before not_notable (non-Latin tag beats compound gate)', () => {
    const d = computeAdmissionDecision(
      { name: 'سد محلی', waterway: 'dam' },
      21.5,
      55.9,
      'dam',
      false,
      15,
      null,
    );
    expect(d).toEqual({ verdict: 'reject', bucket: 'no_resolved_name' });
  });
});

// ---------- Phase 27.3.1 Plan 10 — G1 + G2 gap closure ----------
//
// Plan 10 closes two UAT gaps:
//   - G1: hasName tightened to require real name/name:en/operator (wikidata
//     shortcut removed) so "Dam near X" generic labels disappear.
//   - G2: Turkey removed from PRIORITY_COUNTRIES and a new excluded_turkey
//     reject branch added to computeAdmissionDecision, evaluated AFTER the
//     existing geographic excluded_location guard.
//
// Tests below cover: direct hasName behavior (1-6), PRIORITY_COUNTRIES
// membership (7), excluded_turkey reject (8), decision ordering (9), and
// regression checks on pre-Plan-10 admit paths (10-11) plus an end-to-end
// fetchWaterFacilities integration test (12).

describe('Phase 27.3.1 Plan 10 — G1 + G2 gap closure', () => {
  const mockStress: WaterStressIndicators = {
    bws_raw: 3.5,
    bws_score: 3.5,
    bws_label: 'High',
    drr_score: 2.0,
    gtd_score: 1.5,
    sev_score: 2.5,
    iav_score: 3.0,
    compositeHealth: 0.5,
  };
  const stressLookup = () => mockStress;

  // ---------- hasName tightening (G1) ----------

  it('Test 1 (G1): hasName rejects wikidata-only element', () => {
    // Pre-Plan-10 this returned true via the isNotable shortcut.
    expect(hasName({ wikidata: 'Q123' })).toBe(false);
  });

  it('Test 2 (G1): hasName rejects wikipedia-only element', () => {
    expect(hasName({ wikipedia: 'en:Foo' })).toBe(false);
  });

  it('Test 2b (G1): hasName rejects wikipedia:en-only element', () => {
    // Pre-Plan-10 Object.keys().some(k => k.startsWith('wikipedia:')) admitted.
    expect(hasName({ 'wikipedia:en': 'Foo Dam' })).toBe(false);
  });

  it('Test 3 (G1): hasName accepts real name tag', () => {
    expect(hasName({ name: 'Mosul Dam' })).toBe(true);
  });

  it('Test 4 (G1): hasName accepts name:en tag', () => {
    expect(hasName({ 'name:en': 'Foo Dam' })).toBe(true);
  });

  it('Test 5 (G1): hasName accepts operator tag alone (primary motivation for keeping operator as a valid admission signal)', () => {
    expect(hasName({ operator: 'Generic Water Co' })).toBe(true);
  });

  it('Test 6 (G1): hasName rejects whitespace-only name', () => {
    expect(hasName({ name: '   ' })).toBe(false);
    expect(hasName({ 'name:en': '\t' })).toBe(false);
    expect(hasName({ operator: '  ' })).toBe(false);
  });

  // ---------- PRIORITY_COUNTRIES membership (G2) ----------

  it('Test 7 (G2): Turkey-central coord (39.5, 40.0) is NOT a priority country (Plan 10 removed Turkey)', () => {
    // This coordinate is inside the 600km Diyarbakir radius (distFromSE ~179km)
    // so isExcludedLocation does NOT fire — the only reason this facility would
    // have admitted pre-Plan-10 was priority country membership. That's now
    // gone; the excluded_turkey branch catches it instead.
    expect(isPriorityCountry(39.5, 40.0)).toBe(false);
    // The Iraq/Iran/Saudi priority-country set still holds. Spot-check one.
    expect(isPriorityCountry(33.2, 43.7)).toBe(true);
  });

  // ---------- excluded_turkey reject branch (G2) ----------

  it('Test 8 (G2): Turkish coordinate rejects via excluded_turkey bucket (NOT no_name, NOT not_notable)', () => {
    // Wiki-backed named reservoir in Turkey — pre-Plan-10 the old hasName +
    // 2-of-3 compound gate (priority + isNotable) admitted. Plan 10's Turkey
    // branch catches it first, so the bucket is `excluded_turkey`.
    const d = computeAdmissionDecision(
      {
        natural: 'water',
        water: 'reservoir',
        name: 'Karakaya Dam Reservoir',
        wikidata: 'Q123',
      },
      39.5,
      40.0,
      'reservoir',
      false, // inPriority is false because Plan 10 removed Turkey
      70,
      null,
    );
    expect(d).toEqual({ verdict: 'reject', bucket: 'excluded_turkey' });
  });

  // ---------- Decision ordering (G2 after excluded_location) ----------

  it('Test 9 (G2): decision order — excluded_location fires BEFORE excluded_turkey for western Turkey', () => {
    // Istanbul (41.0, 29.0) is in the western-Turkey band caught by the
    // 600km-from-Diyarbakir rule — isExcludedLocation fires. The bucket
    // should stay `excluded_location`, not `excluded_turkey`, so the
    // semantic split is preserved (geographic vs country-attribution).
    const d = computeAdmissionDecision(
      { natural: 'water', water: 'reservoir', name: 'Istanbul Reservoir' },
      41.0,
      29.0,
      'reservoir',
      false,
      50,
      null,
    );
    expect(d.verdict).toBe('reject');
    if (d.verdict === 'reject') expect(d.bucket).toBe('excluded_location');
  });

  // ---------- Regression checks on pre-Plan-10 admit paths ----------

  it('Test 10: Iranian named reservoir with capacity still admits (R-02 2-of-3 unchanged)', () => {
    // Plan 10's changes target Turkey and the wikidata-only shortcut only.
    // An Iran priority + name + capacity admit must still pass.
    const el = {
      type: 'node' as const,
      id: 4001,
      lat: 35.6,
      lon: 51.4,
      tags: {
        natural: 'water',
        water: 'reservoir',
        name: 'Tehran Test Reservoir',
        volume: '8000000',
      },
    };
    expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
  });

  it('Test 11: Saudi named desalination still admits via desalination exemption (Plan 04 unchanged)', () => {
    const el = {
      type: 'node' as const,
      id: 4002,
      lat: 24.4,
      lon: 54.4,
      tags: { man_made: 'desalination_plant', name: 'Abu Dhabi Desal' },
    };
    expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
  });

  // ---------- End-to-end fetchWaterFacilities integration (G2) ----------

  describe('Test 12 (G2): end-to-end Overpass → fetchWaterFacilities', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('mock Overpass response with one Turkish wiki-backed reservoir → stats.rejections.excluded_turkey = 1 and facility absent from returned array', async () => {
      const turkishAdmit = {
        type: 'node',
        id: 99_901,
        lat: 39.5,
        lon: 40.0,
        tags: {
          natural: 'water',
          water: 'reservoir',
          name: 'Pre-Plan-10 Admitted Turkish Dam',
          wikidata: 'Q1234567',
          volume: '5000000',
        },
      };
      const iraqiAdmit = {
        type: 'node',
        id: 99_902,
        lat: 33.2,
        lon: 43.7,
        tags: {
          natural: 'water',
          water: 'reservoir',
          name: 'Iraqi Reservoir',
          volume: '2000000',
        },
      };
      fetchMock
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ elements: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ) // dams
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ elements: [turkishAdmit, iraqiAdmit] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ) // reservoirs
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ elements: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ); // desalination

      const { facilities, stats } = await fetchWaterFacilities();
      // Turkish facility absent; Iraqi admits.
      expect(facilities.find((f) => f.id === 'water-99901')).toBeUndefined();
      expect(facilities.find((f) => f.id === 'water-99902')).toBeDefined();
      // Bucket fired once on the reservoirs query.
      expect(stats.rejections.excluded_turkey).toBe(1);
      expect(stats.byTypeRejections.reservoirs?.excluded_turkey).toBe(1);
      // And Turkey is absent from byCountry admits.
      expect(stats.byCountry.Turkey).toBeUndefined();
    });
  });
});
