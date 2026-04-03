// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { assignBasinStress } from '../../lib/basinLookup.js';

describe('assignBasinStress', () => {
  it('returns stress indicators for coordinates in Iraq (~33.3N, 44.4E Baghdad)', () => {
    const stress = assignBasinStress(33.3, 44.4);
    expect(stress.bws_label).toBeTruthy();
    expect(typeof stress.bws_score).toBe('number');
    expect(typeof stress.bws_raw).toBe('number');
    expect(typeof stress.drr_score).toBe('number');
    expect(typeof stress.gtd_score).toBe('number');
    expect(typeof stress.sev_score).toBe('number');
    expect(typeof stress.iav_score).toBe('number');
    expect(typeof stress.compositeHealth).toBe('number');
    expect(stress.compositeHealth).toBeGreaterThanOrEqual(0);
    expect(stress.compositeHealth).toBeLessThanOrEqual(1);
  });

  it('returns stress indicators for coordinates in Iran (~35.7N, 51.4E Tehran)', () => {
    const stress = assignBasinStress(35.7, 51.4);
    expect(stress.bws_label).toBeTruthy();
    expect(typeof stress.bws_score).toBe('number');
  });

  it('returns stress indicators for coordinates in Egypt (~30.0N, 31.2E Cairo)', () => {
    const stress = assignBasinStress(30.0, 31.2);
    expect(stress.bws_label).toBeTruthy();
    expect(typeof stress.bws_score).toBe('number');
  });

  it('returns default "No Data" indicators for coordinates far from any basin (e.g., 0N, 0E)', () => {
    const stress = assignBasinStress(0, 0);
    expect(stress.bws_label).toBe('No Data');
    expect(stress.bws_raw).toBe(-1);
    expect(stress.bws_score).toBe(-1);
    expect(stress.drr_score).toBe(-1);
    expect(stress.gtd_score).toBe(-1);
    expect(stress.sev_score).toBe(-1);
    expect(stress.iav_score).toBe(-1);
    expect(stress.compositeHealth).toBe(0.5);
  });

  it('returns default indicators for coordinates far from any country (e.g., -30S, 0E)', () => {
    // Southern Atlantic Ocean -- well beyond 2000km from any ME country centroid
    const stress = assignBasinStress(-30, 0);
    expect(stress.bws_label).toBe('No Data');
    expect(stress.compositeHealth).toBe(0.5);
  });

  it('compositeHealth uses bwsScoreToLabel for label generation', () => {
    const stress = assignBasinStress(33.3, 44.4);
    // bws_label should be a valid WRI label
    const validLabels = ['Low', 'Low-Medium', 'Medium-High', 'High', 'Extremely High', 'No Data', 'Arid and Low Water Use'];
    expect(validLabels).toContain(stress.bws_label);
  });
});
