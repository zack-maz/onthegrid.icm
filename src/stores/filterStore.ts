import { create } from 'zustand';
import { useSearchStore } from '@/stores/searchStore';
import { WAR_START, STEP_MS, LOOKBACK_MS, snapToStep } from '@/lib/constants';
import type { SiteType } from '@/types/entities';

export const ALL_SITE_TYPES: SiteType[] = ['nuclear', 'naval', 'oil', 'airbase', 'port'];
const DEFAULT_SITE_TYPES: SiteType[] = ['nuclear', 'oil'];

/** Full default range for a given granularity (thumbs at both ends) */
function defaultRange(g: Granularity): { dateStart: number; dateEnd: number } {
  const now = Date.now();
  const step = STEP_MS[g];
  const lookback = LOOKBACK_MS[g];
  return {
    dateStart: lookback !== null ? snapToStep(now - lookback, step) : WAR_START,
    dateEnd: snapToStep(now, step),
  };
}

export interface ProximityPin {
  lat: number;
  lng: number;
}

export type FilterKey =
  | 'flightCountry'
  | 'eventCountry'
  | 'flightSpeed'
  | 'altitude'
  | 'proximity'
  | 'date'
  | 'mentions'
  | 'heading'
  | 'callsign'
  | 'icao'
  | 'mmsi'
  | 'shipNameFilter'
  | 'cameo';

export type Granularity = 'minute' | 'hour' | 'day';

export interface FilterState {
  // State
  flightCountries: string[];
  eventCountries: string[];
  flightSpeedMin: number | null;
  flightSpeedMax: number | null;
  altitudeMin: number | null;
  altitudeMax: number | null;
  proximityPin: ProximityPin | null;
  proximityRadiusKm: number;
  dateStart: number;
  dateEnd: number;
  isSettingPin: boolean;
  granularity: Granularity;

  // New text search fields
  flightCallsign: string;
  flightIcao: string;
  shipMmsi: string;
  shipNameFilter: string;
  cameoCode: string;

  // New range fields
  mentionsMin: number | null;
  mentionsMax: number | null;
  headingAngle: number | null; // 0-360, null = no filter

  // Severity toggles
  showHighSeverity: boolean;
  showMediumSeverity: boolean;
  showLowSeverity: boolean;

  // Site type toggles
  enabledSiteTypes: SiteType[];

  // Visibility toggles (independent — each one gates its category independently)
  showFlights: boolean;
  showShips: boolean;
  showAirstrikes: boolean;
  showGroundCombat: boolean;
  showTargeted: boolean;
  showUnidentified: boolean;
  showGroundTraffic: boolean;
  showHealthySites: boolean;
  showAttackedSites: boolean;

  // Actions
  setFlightCountries: (countries: string[]) => void;
  addFlightCountry: (country: string) => void;
  removeFlightCountry: (country: string) => void;
  setEventCountries: (countries: string[]) => void;
  addEventCountry: (country: string) => void;
  removeEventCountry: (country: string) => void;
  setFlightSpeedRange: (min: number | null, max: number | null) => void;
  setAltitudeRange: (min: number | null, max: number | null) => void;
  setProximityPin: (pin: ProximityPin | null) => void;
  setProximityRadius: (km: number) => void;
  setDateRange: (start: number, end: number) => void;
  setSettingPin: (v: boolean) => void;
  setGranularity: (g: Granularity) => void;
  clearFilter: (filter: FilterKey) => void;
  clearAll: () => void;
  activeFilterCount: () => number;

  // New setters
  setFlightCallsign: (v: string) => void;
  setFlightIcao: (v: string) => void;
  setShipMmsi: (v: string) => void;
  setShipNameFilter: (v: string) => void;
  setCameoCode: (v: string) => void;
  setMentionsRange: (min: number | null, max: number | null) => void;
  setHeadingAngle: (v: number | null) => void;
  setShowHighSeverity: (v: boolean) => void;
  setShowMediumSeverity: (v: boolean) => void;
  setShowLowSeverity: (v: boolean) => void;
  setEnabledSiteTypes: (types: SiteType[]) => void;
  toggleSiteType: (type: SiteType) => void;

  // Visibility toggle actions
  toggleShowFlights: () => void;
  toggleShowShips: () => void;
  toggleShowAirstrikes: () => void;
  toggleShowGroundCombat: () => void;
  toggleShowTargeted: () => void;
  toggleShowUnidentified: () => void;
  toggleShowGroundTraffic: () => void;
  toggleShowHealthySites: () => void;
  toggleShowAttackedSites: () => void;
}

const DEFAULTS = {
  flightCountries: [] as string[],
  eventCountries: [] as string[],
  flightSpeedMin: null as number | null,
  flightSpeedMax: null as number | null,
  altitudeMin: null as number | null,
  altitudeMax: null as number | null,
  proximityPin: null as ProximityPin | null,
  proximityRadiusKm: 100,
  ...defaultRange('hour'),
  isSettingPin: false,
  granularity: 'hour' as Granularity,

  // New text search fields
  flightCallsign: '',
  flightIcao: '',
  shipMmsi: '',
  shipNameFilter: '',
  cameoCode: '',

  // New range fields
  mentionsMin: null as number | null,
  mentionsMax: null as number | null,
  headingAngle: null as number | null,

  // Severity toggles
  showHighSeverity: true,
  showMediumSeverity: true,
  showLowSeverity: true,

  // Site type toggles
  enabledSiteTypes: DEFAULT_SITE_TYPES as SiteType[],

  // Visibility toggles (all default ON)
  showFlights: true,
  showShips: true,
  showAirstrikes: true,
  showGroundCombat: true,
  showTargeted: true,
  showUnidentified: true,
  showGroundTraffic: true,
  showHealthySites: true,
  showAttackedSites: true,
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

  setAltitudeRange: (min, max) => set({ altitudeMin: min, altitudeMax: max }),

  setProximityPin: (pin) => set({ proximityPin: pin }),

  setProximityRadius: (km) => set({ proximityRadiusKm: km }),

  setDateRange: (start, end) => set({ dateStart: start, dateEnd: end }),

  setSettingPin: (v) => set({ isSettingPin: v }),

  setGranularity: (g) => set({ granularity: g, ...defaultRange(g) }),

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
      case 'altitude':
        set({ altitudeMin: null, altitudeMax: null });
        break;
      case 'proximity':
        set({ proximityPin: null, proximityRadiusKm: 100 });
        break;
      case 'date':
        set({ granularity: 'hour' as Granularity, ...defaultRange('hour') });
        break;
      case 'mentions':
        set({ mentionsMin: null, mentionsMax: null });
        break;
      case 'heading':
        set({ headingAngle: null });
        break;
      case 'callsign':
        set({ flightCallsign: '' });
        break;
      case 'icao':
        set({ flightIcao: '' });
        break;
      case 'mmsi':
        set({ shipMmsi: '' });
        break;
      case 'shipNameFilter':
        set({ shipNameFilter: '' });
        break;
      case 'cameo':
        set({ cameoCode: '' });
        break;
    }
  },

  clearAll: () => {
    set({ ...DEFAULTS, ...defaultRange('hour') });
    useSearchStore.getState().clearSearch();
  },

  activeFilterCount: () => {
    const s = get();
    let count = 0;
    if (s.flightCountries.length > 0) count++;
    if (s.eventCountries.length > 0) count++;
    if (s.flightSpeedMin !== null || s.flightSpeedMax !== null) count++;
    if (s.altitudeMin !== null || s.altitudeMax !== null) count++;
    if (s.proximityPin !== null) count++;
    if (s.mentionsMin !== null || s.mentionsMax !== null) count++;
    if (s.headingAngle !== null) count++;
    if (s.flightCallsign !== '') count++;
    if (s.flightIcao !== '') count++;
    if (s.shipMmsi !== '') count++;
    if (s.shipNameFilter !== '') count++;
    if (s.cameoCode !== '') count++;
    return count;
  },

  // New setters
  setFlightCallsign: (v) => set({ flightCallsign: v }),
  setFlightIcao: (v) => set({ flightIcao: v }),
  setShipMmsi: (v) => set({ shipMmsi: v }),
  setShipNameFilter: (v) => set({ shipNameFilter: v }),
  setCameoCode: (v) => set({ cameoCode: v }),
  setMentionsRange: (min, max) => set({ mentionsMin: min, mentionsMax: max }),
  setHeadingAngle: (v) => set({ headingAngle: v }),
  setShowHighSeverity: (v) => set({ showHighSeverity: v }),
  setShowMediumSeverity: (v) => set({ showMediumSeverity: v }),
  setShowLowSeverity: (v) => set({ showLowSeverity: v }),
  setEnabledSiteTypes: (types) => set({ enabledSiteTypes: types }),
  toggleSiteType: (type) => set((s) => {
    const enabled = s.enabledSiteTypes.includes(type);
    return {
      enabledSiteTypes: enabled
        ? s.enabledSiteTypes.filter((t) => t !== type)
        : [...s.enabledSiteTypes, type],
    };
  }),

  // Visibility toggles
  toggleShowFlights: () => set((s) => ({ showFlights: !s.showFlights })),
  toggleShowShips: () => set((s) => ({ showShips: !s.showShips })),
  toggleShowAirstrikes: () => set((s) => ({ showAirstrikes: !s.showAirstrikes })),
  toggleShowGroundCombat: () => set((s) => ({ showGroundCombat: !s.showGroundCombat })),
  toggleShowTargeted: () => set((s) => ({ showTargeted: !s.showTargeted })),
  toggleShowUnidentified: () => set((s) => ({ showUnidentified: !s.showUnidentified })),
  toggleShowGroundTraffic: () => set((s) => ({ showGroundTraffic: !s.showGroundTraffic })),
  toggleShowHealthySites: () => set((s) => ({ showHealthySites: !s.showHealthySites })),
  toggleShowAttackedSites: () => set((s) => ({ showAttackedSites: !s.showAttackedSites })),
}));
