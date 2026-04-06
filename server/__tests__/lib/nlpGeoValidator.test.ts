// @vitest-environment node
//
// Tests for NLP geo cross-validation module.
// Validates that actor-geo mismatches are rejected, cross-border events are accepted,
// centroid events are relocated to NLP-extracted cities, and missing data is handled gracefully.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock nlpExtractor to isolate validator logic
vi.mock('../../lib/nlpExtractor.js', () => ({
  extractActorsAndPlaces: vi.fn(),
  lookupCityCoords: vi.fn(),
}));

import { validateEventGeo, type NlpValidationResult } from '../../lib/nlpGeoValidator.js';
import { extractActorsAndPlaces, lookupCityCoords } from '../../lib/nlpExtractor.js';

const mockExtract = vi.mocked(extractActorsAndPlaces);
const mockLookup = vi.mocked(lookupCityCoords);

function defaultTriple() {
  return { actor: null, action: null, target: null };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('validateEventGeo', () => {
  describe('title fetch failure', () => {
    it('returns skipped with title_fetch_failed when title is null', () => {
      const result = validateEventGeo({
        title: null,
        actorCountryCodes: { actor1: 'IRN', actor2: '' },
        geoCountryCode: 'IZ',
        actionGeoType: undefined,
        lat: 33.3,
        lng: 44.3,
      });
      expect(result.status).toBe('skipped');
      expect((result as { reason: string }).reason).toBe('title_fetch_failed');
    });
  });

  describe('no extractable data', () => {
    it('returns skipped when NLP finds no actors or places AND GDELT actors are empty', () => {
      mockExtract.mockReturnValue({
        actors: [],
        places: [],
        triple: defaultTriple(),
      });

      const result = validateEventGeo({
        title: 'Military operation reported',
        actorCountryCodes: { actor1: '', actor2: '' },
        geoCountryCode: 'IZ',
        actionGeoType: undefined,
        lat: 33.3,
        lng: 44.3,
      });
      expect(result.status).toBe('skipped');
      expect((result as { reason: string }).reason).toBe('no_actor_data');
    });
  });

  describe('actor-geo mismatch rejection', () => {
    it('rejects "Israel strikes Hamas" geocoded to Baghdad (IZ)', () => {
      // NLP extracts Israel and Hamas -- both imply IS/GZ, not IZ
      mockExtract.mockReturnValue({
        actors: ['Israel', 'Hamas'],
        places: [],
        triple: defaultTriple(),
      });
      mockLookup.mockReturnValue(null);

      const result = validateEventGeo({
        title: 'Israel strikes Hamas',
        actorCountryCodes: { actor1: 'ISR', actor2: '' },
        geoCountryCode: 'IZ', // Iraq -- mismatch
        actionGeoType: undefined,
        lat: 33.3,
        lng: 44.3,
      });
      expect(result.status).toBe('mismatch');
    });
  });

  describe('cross-border event acceptance', () => {
    it('accepts "Israel strikes targets in Syria" geocoded to Syria (SY)', () => {
      // NLP extracts Israel as actor, Syria as place
      // Syria place maps to SY which matches geoCountryCode
      mockExtract.mockReturnValue({
        actors: ['Israel'],
        places: ['Syria'],
        triple: defaultTriple(),
      });
      mockLookup.mockReturnValue({ lat: 33.5, lng: 36.3, countryCode: 'SY' });

      const result = validateEventGeo({
        title: 'Israel strikes targets in Syria',
        actorCountryCodes: { actor1: 'ISR', actor2: 'SYR' },
        geoCountryCode: 'SY',
        actionGeoType: undefined,
        lat: 33.5,
        lng: 36.3,
      });
      expect(result.status).toBe('verified');
    });

    it('accepts "Iran launches missile at Israel" geocoded to Israel (IS)', () => {
      // Event location is the TARGET (Israel), which matches geocode
      mockExtract.mockReturnValue({
        actors: ['Iran'],
        places: ['Israel'],
        triple: defaultTriple(),
      });
      mockLookup.mockReturnValue({ lat: 31.78, lng: 35.22, countryCode: 'IL' });

      const result = validateEventGeo({
        title: 'Iran launches missile at Israel',
        actorCountryCodes: { actor1: 'IRN', actor2: 'ISR' },
        geoCountryCode: 'IS', // FIPS for Israel
        actionGeoType: undefined,
        lat: 31.78,
        lng: 35.22,
      });
      expect(result.status).toBe('verified');
    });
  });

  describe('centroid relocation', () => {
    it('relocates centroid event when NLP extracts a specific city', () => {
      // "Explosion in Damascus market" geocoded to Damascus centroid
      mockExtract.mockReturnValue({
        actors: [],
        places: ['Damascus'],
        triple: defaultTriple(),
      });
      mockLookup.mockReturnValue({ lat: 33.5130, lng: 36.2920, countryCode: 'SY' });

      const result = validateEventGeo({
        title: 'Explosion in Damascus market',
        actorCountryCodes: { actor1: '', actor2: '' },
        geoCountryCode: 'SY',
        actionGeoType: 3, // centroid
        lat: 33.5, // approximate centroid
        lng: 36.3,
      });
      expect(result.status).toBe('relocated');
      const relocated = result as { status: 'relocated'; newLat: number; newLng: number; cityName: string };
      expect(relocated.newLat).toBe(33.5130);
      expect(relocated.newLng).toBe(36.2920);
      expect(relocated.cityName).toBe('Damascus');
    });

    it('relocates "Airstrike hits Isfahan facility" geocoded to Tehran centroid', () => {
      mockExtract.mockReturnValue({
        actors: [],
        places: ['Isfahan'],
        triple: defaultTriple(),
      });
      mockLookup.mockReturnValue({ lat: 32.6546, lng: 51.6680, countryCode: 'IR' });

      const result = validateEventGeo({
        title: 'Airstrike hits Isfahan facility',
        actorCountryCodes: { actor1: '', actor2: '' },
        geoCountryCode: 'IR',
        actionGeoType: 3, // centroid
        lat: 35.69, // Tehran centroid
        lng: 51.42,
      });
      expect(result.status).toBe('relocated');
      const relocated = result as { status: 'relocated'; newLat: number; newLng: number; cityName: string };
      expect(relocated.newLat).toBe(32.6546);
      expect(relocated.newLng).toBe(51.6680);
      expect(relocated.cityName).toBe('Isfahan');
    });
  });

  describe('verified scenarios', () => {
    it('verifies event when NLP confirms location matches geocode', () => {
      mockExtract.mockReturnValue({
        actors: ['Iran'],
        places: ['Baghdad'],
        triple: defaultTriple(),
      });
      mockLookup.mockReturnValue({ lat: 33.34, lng: 44.37, countryCode: 'IQ' });

      const result = validateEventGeo({
        title: 'Iran shells Baghdad',
        actorCountryCodes: { actor1: 'IRN', actor2: 'IRQ' },
        geoCountryCode: 'IZ', // FIPS for Iraq
        actionGeoType: 2,
        lat: 33.34,
        lng: 44.37,
      });
      expect(result.status).toBe('verified');
    });

    it('verifies when actor country codes include geocode country', () => {
      // NLP extracts actors but no places, actor country matches
      mockExtract.mockReturnValue({
        actors: ['Iran'],
        places: [],
        triple: defaultTriple(),
      });
      mockLookup.mockReturnValue(null);

      const result = validateEventGeo({
        title: 'Iran military operation',
        actorCountryCodes: { actor1: 'IRN', actor2: '' },
        geoCountryCode: 'IR', // Iran matches IRN -> IR
        actionGeoType: 2,
        lat: 35.69,
        lng: 51.42,
      });
      expect(result.status).toBe('verified');
    });
  });

  describe('insufficient NLP data', () => {
    it('returns skipped when title has no actors or places but GDELT fields are also empty', () => {
      mockExtract.mockReturnValue({
        actors: [],
        places: [],
        triple: defaultTriple(),
      });

      const result = validateEventGeo({
        title: 'Breaking news update',
        actorCountryCodes: { actor1: '', actor2: '' },
        geoCountryCode: 'IR',
        actionGeoType: undefined,
        lat: 35.69,
        lng: 51.42,
      });
      expect(result.status).toBe('skipped');
    });
  });

  describe('edge cases', () => {
    it('handles unknown CAMEO country codes gracefully', () => {
      mockExtract.mockReturnValue({
        actors: ['Unknown Force'],
        places: [],
        triple: defaultTriple(),
      });

      const result = validateEventGeo({
        title: 'Unknown Force attacks',
        actorCountryCodes: { actor1: 'XXX', actor2: '' },
        geoCountryCode: 'IR',
        actionGeoType: undefined,
        lat: 35.69,
        lng: 51.42,
      });
      // XXX doesn't map to any ME FIPS -- penalized as non-ME actor1
      expect(result.status).toBe('penalized');
    });

    it('does not relocate non-centroid events even with NLP city', () => {
      // ActionGeoType=2 (state/region level, not centroid)
      mockExtract.mockReturnValue({
        actors: [],
        places: ['Damascus'],
        triple: defaultTriple(),
      });
      mockLookup.mockReturnValue({ lat: 33.5130, lng: 36.2920, countryCode: 'SY' });

      const result = validateEventGeo({
        title: 'Explosion in Damascus market',
        actorCountryCodes: { actor1: '', actor2: '' },
        geoCountryCode: 'SY',
        actionGeoType: 2, // NOT centroid -- state/region
        lat: 33.5,
        lng: 36.3,
      });
      // Should verify (place country SY matches geo SY) but not relocate
      expect(result.status).toBe('verified');
    });

    it('handles PKK cross-border correctly (actor operates in TU/IZ/SY)', () => {
      mockExtract.mockReturnValue({
        actors: ['PKK'],
        places: [],
        triple: defaultTriple(),
      });

      const result = validateEventGeo({
        title: 'PKK fighters engaged',
        actorCountryCodes: { actor1: '', actor2: '' },
        geoCountryCode: 'IZ', // Iraq -- PKK operates here
        actionGeoType: 2,
        lat: 36.19,
        lng: 44.01,
      });
      expect(result.status).toBe('verified');
    });

    it('handles Hezbollah correctly (operates in LE/SY)', () => {
      mockExtract.mockReturnValue({
        actors: ['Hezbollah'],
        places: [],
        triple: defaultTriple(),
      });

      const result = validateEventGeo({
        title: 'Hezbollah launches rockets',
        actorCountryCodes: { actor1: '', actor2: '' },
        geoCountryCode: 'LE', // Lebanon
        actionGeoType: 2,
        lat: 33.88,
        lng: 35.50,
      });
      expect(result.status).toBe('verified');
    });
  });
});
