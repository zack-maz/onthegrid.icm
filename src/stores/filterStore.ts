import { create } from 'zustand';
import { useUIStore } from '@/stores/uiStore';
import { STEP_MS, snapToStep } from '@/lib/constants';

export interface ProximityPin {
  lat: number;
  lng: number;
}

export type FilterKey = 'flightCountry' | 'eventCountry' | 'flightSpeed' | 'shipSpeed' | 'altitude' | 'proximity' | 'date';

export type Granularity = 'minute' | 'hour' | 'day';

export interface SavedToggles {
  showFlights: boolean;
  showGroundTraffic: boolean;
  pulseEnabled: boolean;
  showShips: boolean;
}

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
  granularity: Granularity;
  savedToggles: SavedToggles | null;

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
  setGranularity: (g: Granularity) => void;
  isCustomRangeActive: () => boolean;
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
  granularity: 'hour' as Granularity,
  savedToggles: null as SavedToggles | null,
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

  setDateRange: (start, end) => {
    const prev = get();
    set({ dateStart: start, dateEnd: end });

    // Auto-activate: end went from null to non-null
    if (end !== null && prev.savedToggles === null) {
      const ui = useUIStore.getState();
      set({
        savedToggles: {
          showFlights: ui.showFlights,
          showGroundTraffic: ui.showGroundTraffic,
          pulseEnabled: ui.pulseEnabled,
          showShips: ui.showShips,
        },
      });
      useUIStore.setState({
        showFlights: false,
        showGroundTraffic: false,
        pulseEnabled: false,
        showShips: false,
      });
    }

    // Auto-deactivate: end went from non-null to null
    if (end === null && prev.savedToggles !== null) {
      useUIStore.setState({ ...prev.savedToggles });
      set({ savedToggles: null });
    }
  },

  setSettingPin: (v) => set({ isSettingPin: v }),

  setGranularity: (g) => {
    const { dateStart, dateEnd } = get();
    const step = STEP_MS[g];
    let newStart = dateStart !== null ? snapToStep(dateStart, step) : null;
    let newEnd = dateEnd !== null ? snapToStep(dateEnd, step) : null;
    // Clamp start to end if snapping reversed them
    if (newStart !== null && newEnd !== null && newStart > newEnd) {
      newStart = newEnd;
    }
    set({ granularity: g, dateStart: newStart, dateEnd: newEnd });
  },

  isCustomRangeActive: () => get().savedToggles !== null,

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
      case 'date': {
        const { savedToggles } = get();
        if (savedToggles !== null) {
          useUIStore.setState({ ...savedToggles });
        }
        set({ dateStart: null, dateEnd: null, savedToggles: null });
        break;
      }
    }
  },

  clearAll: () => {
    const { savedToggles } = get();
    if (savedToggles !== null) {
      useUIStore.setState({ ...savedToggles });
    }
    set({ ...DEFAULTS });
  },

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
