import { beforeEach, describe, expect, it } from 'vitest';
import { useFilterStore } from '@/stores/filterStore';

describe('filterStore', () => {
  beforeEach(() => {
    useFilterStore.getState().clearAll();
  });

  describe('defaults', () => {
    it('flightCountries defaults to empty array', () => {
      expect(useFilterStore.getState().flightCountries).toEqual([]);
    });

    it('eventCountries defaults to empty array', () => {
      expect(useFilterStore.getState().eventCountries).toEqual([]);
    });

    it('flightSpeedMin/flightSpeedMax default to null', () => {
      const s = useFilterStore.getState();
      expect(s.flightSpeedMin).toBeNull();
      expect(s.flightSpeedMax).toBeNull();
    });

    it('altitudeMin/altitudeMax default to null', () => {
      const s = useFilterStore.getState();
      expect(s.altitudeMin).toBeNull();
      expect(s.altitudeMax).toBeNull();
    });

    it('proximityPin defaults to null', () => {
      expect(useFilterStore.getState().proximityPin).toBeNull();
    });

    it('proximityRadiusKm defaults to 100', () => {
      expect(useFilterStore.getState().proximityRadiusKm).toBe(100);
    });

    it('dateStart defaults to null, dateEnd defaults to null', () => {
      const s = useFilterStore.getState();
      expect(s.dateStart).toBeNull();
      expect(s.dateEnd).toBeNull();
    });

    it('isSettingPin defaults to false', () => {
      expect(useFilterStore.getState().isSettingPin).toBe(false);
    });

    it('granularity defaults to hour', () => {
      expect(useFilterStore.getState().granularity).toBe('hour');
    });

    it('new text fields default to empty strings', () => {
      const s = useFilterStore.getState();
      expect(s.flightCallsign).toBe('');
      expect(s.flightIcao).toBe('');
      expect(s.shipMmsi).toBe('');
      expect(s.shipNameFilter).toBe('');
      expect(s.cameoCode).toBe('');
    });

    it('new range fields default to null', () => {
      const s = useFilterStore.getState();
      expect(s.mentionsMin).toBeNull();
      expect(s.mentionsMax).toBeNull();
      expect(s.headingAngle).toBeNull();
    });

    it('severity toggles default to true', () => {
      const s = useFilterStore.getState();
      expect(s.showHighSeverity).toBe(true);
      expect(s.showMediumSeverity).toBe(true);
      expect(s.showLowSeverity).toBe(true);
    });
  });

  describe('flight country actions', () => {
    it('setFlightCountries replaces flightCountries array', () => {
      useFilterStore.getState().setFlightCountries(['Iran', 'Iraq']);
      expect(useFilterStore.getState().flightCountries).toEqual(['Iran', 'Iraq']);
    });

    it('addFlightCountry appends to flightCountries', () => {
      useFilterStore.getState().addFlightCountry('Iran');
      useFilterStore.getState().addFlightCountry('Iraq');
      expect(useFilterStore.getState().flightCountries).toEqual(['Iran', 'Iraq']);
    });

    it('addFlightCountry prevents duplicates', () => {
      useFilterStore.getState().addFlightCountry('Iran');
      useFilterStore.getState().addFlightCountry('Iran');
      expect(useFilterStore.getState().flightCountries).toEqual(['Iran']);
    });

    it('removeFlightCountry removes from flightCountries', () => {
      useFilterStore.getState().setFlightCountries(['Iran', 'Iraq', 'Turkey']);
      useFilterStore.getState().removeFlightCountry('Iraq');
      expect(useFilterStore.getState().flightCountries).toEqual(['Iran', 'Turkey']);
    });
  });

  describe('event country actions', () => {
    it('setEventCountries replaces eventCountries array', () => {
      useFilterStore.getState().setEventCountries(['ISRAEL', 'IRAN']);
      expect(useFilterStore.getState().eventCountries).toEqual(['ISRAEL', 'IRAN']);
    });

    it('addEventCountry appends to eventCountries', () => {
      useFilterStore.getState().addEventCountry('ISRAEL');
      useFilterStore.getState().addEventCountry('IRAN');
      expect(useFilterStore.getState().eventCountries).toEqual(['ISRAEL', 'IRAN']);
    });

    it('addEventCountry prevents duplicates', () => {
      useFilterStore.getState().addEventCountry('ISRAEL');
      useFilterStore.getState().addEventCountry('ISRAEL');
      expect(useFilterStore.getState().eventCountries).toEqual(['ISRAEL']);
    });

    it('removeEventCountry removes from eventCountries', () => {
      useFilterStore.getState().setEventCountries(['ISRAEL', 'IRAN', 'IRAQ']);
      useFilterStore.getState().removeEventCountry('IRAN');
      expect(useFilterStore.getState().eventCountries).toEqual(['ISRAEL', 'IRAQ']);
    });
  });

  describe('range actions', () => {
    it('setFlightSpeedRange sets flightSpeedMin and flightSpeedMax', () => {
      useFilterStore.getState().setFlightSpeedRange(100, 400);
      const s = useFilterStore.getState();
      expect(s.flightSpeedMin).toBe(100);
      expect(s.flightSpeedMax).toBe(400);
    });

    it('setAltitudeRange sets altitudeMin and altitudeMax', () => {
      useFilterStore.getState().setAltitudeRange(10000, 40000);
      const s = useFilterStore.getState();
      expect(s.altitudeMin).toBe(10000);
      expect(s.altitudeMax).toBe(40000);
    });

    it('setMentionsRange sets mentionsMin and mentionsMax', () => {
      useFilterStore.getState().setMentionsRange(10, 500);
      const s = useFilterStore.getState();
      expect(s.mentionsMin).toBe(10);
      expect(s.mentionsMax).toBe(500);
    });

    it('setHeadingAngle sets headingAngle', () => {
      useFilterStore.getState().setHeadingAngle(180);
      expect(useFilterStore.getState().headingAngle).toBe(180);
    });
  });

  describe('proximity actions', () => {
    it('setProximityPin sets pin coordinates', () => {
      useFilterStore.getState().setProximityPin({ lat: 35, lng: 51 });
      expect(useFilterStore.getState().proximityPin).toEqual({ lat: 35, lng: 51 });
    });

    it('setProximityPin with null clears pin', () => {
      useFilterStore.getState().setProximityPin({ lat: 35, lng: 51 });
      useFilterStore.getState().setProximityPin(null);
      expect(useFilterStore.getState().proximityPin).toBeNull();
    });

    it('setProximityRadius sets radius', () => {
      useFilterStore.getState().setProximityRadius(250);
      expect(useFilterStore.getState().proximityRadiusKm).toBe(250);
    });
  });

  describe('date actions', () => {
    it('setDateRange sets dateStart and dateEnd', () => {
      const start = Date.now() - 86400000;
      const end = Date.now();
      useFilterStore.getState().setDateRange(start, end);
      const s = useFilterStore.getState();
      expect(s.dateStart).toBe(start);
      expect(s.dateEnd).toBe(end);
    });
  });

  describe('pin mode', () => {
    it('setSettingPin sets isSettingPin boolean', () => {
      useFilterStore.getState().setSettingPin(true);
      expect(useFilterStore.getState().isSettingPin).toBe(true);
      useFilterStore.getState().setSettingPin(false);
      expect(useFilterStore.getState().isSettingPin).toBe(false);
    });
  });

  describe('clearFilter', () => {
    it('clearFilter(flightCountry) resets flightCountries to empty', () => {
      useFilterStore.getState().setFlightCountries(['Iran', 'Iraq']);
      useFilterStore.getState().clearFilter('flightCountry');
      expect(useFilterStore.getState().flightCountries).toEqual([]);
    });

    it('clearFilter(eventCountry) resets eventCountries to empty', () => {
      useFilterStore.getState().setEventCountries(['ISRAEL', 'IRAN']);
      useFilterStore.getState().clearFilter('eventCountry');
      expect(useFilterStore.getState().eventCountries).toEqual([]);
    });

    it('clearFilter(flightSpeed) resets flightSpeedMin/flightSpeedMax to null', () => {
      useFilterStore.getState().setFlightSpeedRange(100, 400);
      useFilterStore.getState().clearFilter('flightSpeed');
      const s = useFilterStore.getState();
      expect(s.flightSpeedMin).toBeNull();
      expect(s.flightSpeedMax).toBeNull();
    });

    it('clearFilter(altitude) resets altitudeMin/altitudeMax to null', () => {
      useFilterStore.getState().setAltitudeRange(10000, 40000);
      useFilterStore.getState().clearFilter('altitude');
      const s = useFilterStore.getState();
      expect(s.altitudeMin).toBeNull();
      expect(s.altitudeMax).toBeNull();
    });

    it('clearFilter(proximity) resets proximityPin to null and radius to default', () => {
      useFilterStore.getState().setProximityPin({ lat: 35, lng: 51 });
      useFilterStore.getState().setProximityRadius(250);
      useFilterStore.getState().clearFilter('proximity');
      expect(useFilterStore.getState().proximityPin).toBeNull();
      expect(useFilterStore.getState().proximityRadiusKm).toBe(100);
    });

    it('clearFilter(date) resets dateStart and dateEnd to null', () => {
      useFilterStore.getState().setDateRange(1000, 2000);
      useFilterStore.getState().clearFilter('date');
      const s = useFilterStore.getState();
      expect(s.dateStart).toBeNull();
      expect(s.dateEnd).toBeNull();
    });

    it('clearFilter(mentions) resets mentionsMin/mentionsMax to null', () => {
      useFilterStore.getState().setMentionsRange(10, 500);
      useFilterStore.getState().clearFilter('mentions');
      const s = useFilterStore.getState();
      expect(s.mentionsMin).toBeNull();
      expect(s.mentionsMax).toBeNull();
    });

    it('clearFilter(heading) resets headingAngle to null', () => {
      useFilterStore.getState().setHeadingAngle(180);
      useFilterStore.getState().clearFilter('heading');
      expect(useFilterStore.getState().headingAngle).toBeNull();
    });
  });

  describe('clearAll', () => {
    it('resets all filter fields to defaults', () => {
      useFilterStore.getState().setFlightCountries(['Iran']);
      useFilterStore.getState().setEventCountries(['ISRAEL']);
      useFilterStore.getState().setFlightSpeedRange(100, 400);
      useFilterStore.getState().setAltitudeRange(10000, 40000);
      useFilterStore.getState().setProximityPin({ lat: 35, lng: 51 });
      useFilterStore.getState().setProximityRadius(250);
      useFilterStore.getState().setDateRange(1000, 2000);
      useFilterStore.getState().setSettingPin(true);
      useFilterStore.getState().setFlightCallsign('IRA');
      useFilterStore.getState().setFlightIcao('abc');
      useFilterStore.getState().setShipMmsi('123');
      useFilterStore.getState().setShipNameFilter('TANK');
      useFilterStore.getState().setCameoCode('190');
      useFilterStore.getState().setMentionsRange(10, 500);
      useFilterStore.getState().setHeadingAngle(180);
      useFilterStore.getState().setShowHighSeverity(false);

      useFilterStore.getState().clearAll();
      const s = useFilterStore.getState();
      expect(s.flightCountries).toEqual([]);
      expect(s.eventCountries).toEqual([]);
      expect(s.flightSpeedMin).toBeNull();
      expect(s.flightSpeedMax).toBeNull();
      expect(s.altitudeMin).toBeNull();
      expect(s.altitudeMax).toBeNull();
      expect(s.proximityPin).toBeNull();
      expect(s.proximityRadiusKm).toBe(100);
      expect(s.dateStart).toBeNull();
      expect(s.dateEnd).toBeNull();
      expect(s.isSettingPin).toBe(false);
      expect(s.flightCallsign).toBe('');
      expect(s.flightIcao).toBe('');
      expect(s.shipMmsi).toBe('');
      expect(s.shipNameFilter).toBe('');
      expect(s.cameoCode).toBe('');
      expect(s.mentionsMin).toBeNull();
      expect(s.mentionsMax).toBeNull();
      expect(s.headingAngle).toBeNull();
      expect(s.showHighSeverity).toBe(true);
      expect(s.showMediumSeverity).toBe(true);
      expect(s.showLowSeverity).toBe(true);
    });
  });

  describe('granularity', () => {
    it('setGranularity updates granularity', () => {
      useFilterStore.getState().setGranularity('minute');
      expect(useFilterStore.getState().granularity).toBe('minute');
    });

    it('setGranularity snaps dateStart to new step boundary', () => {
      const oddTs = Date.UTC(2026, 2, 10, 14, 37, 22);
      useFilterStore.getState().setDateRange(oddTs, null);
      useFilterStore.getState().setGranularity('hour');
      const s = useFilterStore.getState();
      expect(s.dateStart).toBe(Date.UTC(2026, 2, 10, 14, 0, 0));
    });

    it('setGranularity snaps dateEnd to new step boundary', () => {
      const oddTs = Date.UTC(2026, 2, 10, 14, 37, 22);
      useFilterStore.getState().setDateRange(null, oddTs);
      useFilterStore.getState().setGranularity('day');
      const s = useFilterStore.getState();
      expect(s.dateEnd).toBe(Date.UTC(2026, 2, 10, 0, 0, 0));
    });

    it('setGranularity clamps start to end if snapping makes start > end', () => {
      const start = Date.UTC(2026, 2, 10, 23, 30, 0);
      const end = Date.UTC(2026, 2, 10, 23, 45, 0);
      useFilterStore.getState().setDateRange(start, end);
      useFilterStore.getState().setGranularity('day');
      const s = useFilterStore.getState();
      expect(s.dateStart! <= s.dateEnd!).toBe(true);
    });
  });

  describe('24h default event window', () => {
    it('isDefaultWindowActive returns true when dateStart=null and dateEnd=null', () => {
      const s = useFilterStore.getState();
      expect(s.isDefaultWindowActive()).toBe(true);
    });

    it('isDefaultWindowActive returns false when dateStart is non-null', () => {
      useFilterStore.getState().setDateRange(Date.now() - 86400000, null);
      expect(useFilterStore.getState().isDefaultWindowActive()).toBe(false);
    });

    it('isDefaultWindowActive returns false when dateEnd is non-null', () => {
      useFilterStore.getState().setDateRange(null, Date.now());
      expect(useFilterStore.getState().isDefaultWindowActive()).toBe(false);
    });

    it('isDefaultWindowActive returns false when both dateStart and dateEnd are non-null', () => {
      useFilterStore.getState().setDateRange(Date.now() - 86400000, Date.now());
      expect(useFilterStore.getState().isDefaultWindowActive()).toBe(false);
    });

    it('isDefaultWindowActive returns true after clearing date range', () => {
      useFilterStore.getState().setDateRange(1000, 2000);
      useFilterStore.getState().clearFilter('date');
      expect(useFilterStore.getState().isDefaultWindowActive()).toBe(true);
    });
  });

  describe('activeFilterCount', () => {
    it('returns 0 when no filters are active', () => {
      expect(useFilterStore.getState().activeFilterCount()).toBe(0);
    });

    it('counts flightCountry filter when countries selected', () => {
      useFilterStore.getState().setFlightCountries(['Iran']);
      expect(useFilterStore.getState().activeFilterCount()).toBe(1);
    });

    it('counts eventCountry filter when countries selected', () => {
      useFilterStore.getState().setEventCountries(['ISRAEL']);
      expect(useFilterStore.getState().activeFilterCount()).toBe(1);
    });

    it('counts flightSpeed filter when flightSpeedMin set', () => {
      useFilterStore.getState().setFlightSpeedRange(100, null);
      expect(useFilterStore.getState().activeFilterCount()).toBe(1);
    });

    it('counts flightSpeed filter when flightSpeedMax set', () => {
      useFilterStore.getState().setFlightSpeedRange(null, 400);
      expect(useFilterStore.getState().activeFilterCount()).toBe(1);
    });

    it('counts altitude filter when altitudeMin set', () => {
      useFilterStore.getState().setAltitudeRange(10000, null);
      expect(useFilterStore.getState().activeFilterCount()).toBe(1);
    });

    it('counts proximity filter when pin set', () => {
      useFilterStore.getState().setProximityPin({ lat: 35, lng: 51 });
      expect(useFilterStore.getState().activeFilterCount()).toBe(1);
    });

    it('counts date filter when dateStart set', () => {
      useFilterStore.getState().setDateRange(1000, null);
      expect(useFilterStore.getState().activeFilterCount()).toBe(1);
    });

    it('returns correct count when all filters active', () => {
      useFilterStore.getState().setFlightCountries(['Iran']);
      useFilterStore.getState().setEventCountries(['ISRAEL']);
      useFilterStore.getState().setFlightSpeedRange(100, 400);
      useFilterStore.getState().setAltitudeRange(10000, 40000);
      useFilterStore.getState().setProximityPin({ lat: 35, lng: 51 });
      useFilterStore.getState().setDateRange(1000, 2000);
      useFilterStore.getState().setMentionsRange(10, 500);
      useFilterStore.getState().setHeadingAngle(180);
      useFilterStore.getState().setFlightCallsign('IRA');
      useFilterStore.getState().setFlightIcao('abc');
      useFilterStore.getState().setShipMmsi('123');
      useFilterStore.getState().setShipNameFilter('TANK');
      useFilterStore.getState().setCameoCode('190');
      // 13 filters: flightCountry, eventCountry, flightSpeed, altitude, proximity, date, mentions, heading, callsign, icao, mmsi, shipName, cameo
      expect(useFilterStore.getState().activeFilterCount()).toBe(13);
    });
  });
});
