import { create } from 'zustand';

export interface ProximityPin {
  lat: number;
  lng: number;
}

export type FilterKey = 'flightCountry' | 'eventCountry' | 'flightSpeed' | 'shipSpeed' | 'altitude' | 'proximity' | 'date';

export interface FilterState {
  // State
  flightCountries: string[];
  eventCountries: string[];
  flightSpeedMin: number | null;
  flightSpeedMax: number | null;
  shipSpeedMin: number | null;
  shipSpeedMax: number | null;
  altitudeMin: number | null;
  altitudeMax: number | null;
  proximityPin: ProximityPin | null;
  proximityRadiusKm: number;
  dateStart: number | null;
  dateEnd: number | null;
  isSettingPin: boolean;

  // Actions
  setFlightCountries: (countries: string[]) => void;
  addFlightCountry: (country: string) => void;
  removeFlightCountry: (country: string) => void;
  setEventCountries: (countries: string[]) => void;
  addEventCountry: (country: string) => void;
  removeEventCountry: (country: string) => void;
  setFlightSpeedRange: (min: number | null, max: number | null) => void;
  setShipSpeedRange: (min: number | null, max: number | null) => void;
  setAltitudeRange: (min: number | null, max: number | null) => void;
  setProximityPin: (pin: ProximityPin | null) => void;
  setProximityRadius: (km: number) => void;
  setDateRange: (start: number | null, end: number | null) => void;
  setSettingPin: (v: boolean) => void;
  clearFilter: (filter: FilterKey) => void;
  clearAll: () => void;
  activeFilterCount: () => number;
}

const DEFAULTS = {
  flightCountries: [] as string[],
  eventCountries: [] as string[],
  flightSpeedMin: null as number | null,
  flightSpeedMax: null as number | null,
  shipSpeedMin: null as number | null,
  shipSpeedMax: null as number | null,
  altitudeMin: null as number | null,
  altitudeMax: null as number | null,
  proximityPin: null as ProximityPin | null,
  proximityRadiusKm: 100,
  dateStart: null as number | null,
  dateEnd: null as number | null,
  isSettingPin: false,
};

export const useFilterStore = create<FilterState>()((set, get) => ({
  ...DEFAULTS,

  setFlightCountries: (countries) => set({ flightCountries: countries }),

  addFlightCountry: (country) =>
    set((s) => {
      if (s.flightCountries.includes(country)) return s;
      return { flightCountries: [...s.flightCountries, country] };
    }),

  removeFlightCountry: (country) =>
    set((s) => ({
      flightCountries: s.flightCountries.filter((c) => c !== country),
    })),

  setEventCountries: (countries) => set({ eventCountries: countries }),

  addEventCountry: (country) =>
    set((s) => {
      if (s.eventCountries.includes(country)) return s;
      return { eventCountries: [...s.eventCountries, country] };
    }),

  removeEventCountry: (country) =>
    set((s) => ({
      eventCountries: s.eventCountries.filter((c) => c !== country),
    })),

  setFlightSpeedRange: (min, max) => set({ flightSpeedMin: min, flightSpeedMax: max }),

  setShipSpeedRange: (min, max) => set({ shipSpeedMin: min, shipSpeedMax: max }),

  setAltitudeRange: (min, max) => set({ altitudeMin: min, altitudeMax: max }),

  setProximityPin: (pin) => set({ proximityPin: pin }),

  setProximityRadius: (km) => set({ proximityRadiusKm: km }),

  setDateRange: (start, end) => set({ dateStart: start, dateEnd: end }),

  setSettingPin: (v) => set({ isSettingPin: v }),

  clearFilter: (filter) => {
    switch (filter) {
      case 'flightCountry':
        set({ flightCountries: [] });
        break;
      case 'eventCountry':
        set({ eventCountries: [] });
        break;
      case 'flightSpeed':
        set({ flightSpeedMin: null, flightSpeedMax: null });
        break;
      case 'shipSpeed':
        set({ shipSpeedMin: null, shipSpeedMax: null });
        break;
      case 'altitude':
        set({ altitudeMin: null, altitudeMax: null });
        break;
      case 'proximity':
        set({ proximityPin: null, proximityRadiusKm: 100 });
        break;
      case 'date':
        set({ dateStart: null, dateEnd: null });
        break;
    }
  },

  clearAll: () => set({ ...DEFAULTS }),

  activeFilterCount: () => {
    const s = get();
    let count = 0;
    if (s.flightCountries.length > 0) count++;
    if (s.eventCountries.length > 0) count++;
    if (s.flightSpeedMin !== null || s.flightSpeedMax !== null) count++;
    if (s.shipSpeedMin !== null || s.shipSpeedMax !== null) count++;
    if (s.altitudeMin !== null || s.altitudeMax !== null) count++;
    if (s.proximityPin !== null) count++;
    if (s.dateStart !== null || s.dateEnd !== null) count++;
    return count;
  },
}));
