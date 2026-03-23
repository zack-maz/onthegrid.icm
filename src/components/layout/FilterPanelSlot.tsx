import { useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import { useFlightStore } from '@/stores/flightStore';
import { useEventStore } from '@/stores/eventStore';
import { OverlayPanel } from '@/components/ui/OverlayPanel';
import { RangeSlider } from '@/components/filter/RangeSlider';
import { CountryFilter } from '@/components/filter/CountryFilter';
import { ProximityFilter } from '@/components/filter/ProximityFilter';
import { DateRangeFilter } from '@/components/filter/DateRangeFilter';
import { TextSearchInput } from '@/components/filter/TextSearchInput';
import { HeadingSlider } from '@/components/filter/HeadingSlider';
import { SeverityToggles } from '@/components/filter/SeverityToggles';
import { VisibilityButton } from '@/components/filter/VisibilityButton';
import type { FilterKey } from '@/stores/filterStore';

function SectionHeader({
  label,
  active,
  filterKey,
  onClear,
}: {
  label: string;
  active: boolean;
  filterKey: FilterKey;
  onClear: (key: FilterKey) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className={`text-[10px] ${active ? 'text-accent-blue' : 'text-text-muted'}`}>
          {active ? '\u25B6' : '---'}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {label}
        </span>
      </div>
      {active && (
        <button
          onClick={() => onClear(filterKey)}
          className="text-[10px] text-text-muted hover:text-accent-red"
          aria-label={`Clear ${label} filter`}
        >
          x
        </button>
      )}
    </div>
  );
}

function EntitySectionHeader({
  label,
  isOpen,
  onToggle,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary"
    >
      <span className="text-[10px] text-text-muted">{isOpen ? '\u25BE' : '\u25B8'}</span>
      {label}
    </button>
  );
}

function BooleanToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      className="flex w-full items-center justify-between py-0.5"
    >
      <span className={`text-[10px] uppercase tracking-wider ${active ? 'text-accent-blue' : 'text-text-muted'}`}>
        {label}
      </span>
      <span
        className={`inline-block h-3 w-6 rounded-full transition-colors ${active ? 'bg-accent-blue' : 'bg-white/10'}`}
      >
        <span
          className={`block h-3 w-3 rounded-full bg-white transition-transform ${active ? 'translate-x-3' : 'translate-x-0'}`}
        />
      </span>
    </button>
  );
}

/** Inner content of filter panel, reusable in Sidebar */
export function FilterPanelContent() {
  const isFlightFiltersOpen = useUIStore((s) => s.isFlightFiltersOpen);
  const isShipFiltersOpen = useUIStore((s) => s.isShipFiltersOpen);
  const isEventFiltersOpen = useUIStore((s) => s.isEventFiltersOpen);
  const toggleFlightFilters = useUIStore((s) => s.toggleFlightFilters);
  const toggleShipFilters = useUIStore((s) => s.toggleShipFilters);
  const toggleEventFilters = useUIStore((s) => s.toggleEventFilters);

  // Entity visibility toggles
  const showFlights = useUIStore((s) => s.showFlights);
  const toggleFlights = useUIStore((s) => s.toggleFlights);
  const showGroundTraffic = useUIStore((s) => s.showGroundTraffic);
  const toggleGroundTraffic = useUIStore((s) => s.toggleGroundTraffic);
  const pulseEnabled = useUIStore((s) => s.pulseEnabled);
  const togglePulse = useUIStore((s) => s.togglePulse);
  const showShips = useUIStore((s) => s.showShips);
  const toggleShips = useUIStore((s) => s.toggleShips);
  const showAirstrikes = useUIStore((s) => s.showAirstrikes);
  const toggleAirstrikes = useUIStore((s) => s.toggleAirstrikes);
  const showGroundCombat = useUIStore((s) => s.showGroundCombat);
  const toggleGroundCombat = useUIStore((s) => s.toggleGroundCombat);
  const showTargeted = useUIStore((s) => s.showTargeted);
  const toggleTargeted = useUIStore((s) => s.toggleTargeted);
  const showNuclear = useUIStore((s) => s.showNuclear);
  const toggleNuclear = useUIStore((s) => s.toggleNuclear);
  const showNaval = useUIStore((s) => s.showNaval);
  const toggleNaval = useUIStore((s) => s.toggleNaval);
  const showOil = useUIStore((s) => s.showOil);
  const toggleOil = useUIStore((s) => s.toggleOil);
  const showAirbase = useUIStore((s) => s.showAirbase);
  const toggleAirbase = useUIStore((s) => s.toggleAirbase);
  const showDesalination = useUIStore((s) => s.showDesalination);
  const toggleDesalination = useUIStore((s) => s.toggleDesalination);
  const showPort = useUIStore((s) => s.showPort);
  const togglePort = useUIStore((s) => s.togglePort);
  const showHealthySites = useUIStore((s) => s.showHealthySites);
  const toggleHealthySites = useUIStore((s) => s.toggleHealthySites);
  const showAttackedSites = useUIStore((s) => s.showAttackedSites);
  const toggleAttackedSites = useUIStore((s) => s.toggleAttackedSites);

  // Filter store — country filters
  const eventCountries = useFilterStore((s) => s.eventCountries);
  const addEventCountry = useFilterStore((s) => s.addEventCountry);
  const removeEventCountry = useFilterStore((s) => s.removeEventCountry);

  // Filter store — flight filters
  const flightSpeedMin = useFilterStore((s) => s.flightSpeedMin);
  const flightSpeedMax = useFilterStore((s) => s.flightSpeedMax);
  const setFlightSpeedRange = useFilterStore((s) => s.setFlightSpeedRange);
  const altitudeMin = useFilterStore((s) => s.altitudeMin);
  const altitudeMax = useFilterStore((s) => s.altitudeMax);
  const setAltitudeRange = useFilterStore((s) => s.setAltitudeRange);
  const flightCallsign = useFilterStore((s) => s.flightCallsign);
  const setFlightCallsign = useFilterStore((s) => s.setFlightCallsign);
  const flightIcao = useFilterStore((s) => s.flightIcao);
  const setFlightIcao = useFilterStore((s) => s.setFlightIcao);
  const headingAngle = useFilterStore((s) => s.headingAngle);
  const setHeadingAngle = useFilterStore((s) => s.setHeadingAngle);

  // Filter store — ship filters
  const shipMmsi = useFilterStore((s) => s.shipMmsi);
  const setShipMmsi = useFilterStore((s) => s.setShipMmsi);
  const shipNameFilter = useFilterStore((s) => s.shipNameFilter);
  const setShipNameFilter = useFilterStore((s) => s.setShipNameFilter);

  // Filter store — conflict filters
  const cameoCode = useFilterStore((s) => s.cameoCode);
  const setCameoCode = useFilterStore((s) => s.setCameoCode);
  const mentionsMin = useFilterStore((s) => s.mentionsMin);
  const mentionsMax = useFilterStore((s) => s.mentionsMax);
  const setMentionsRange = useFilterStore((s) => s.setMentionsRange);

  // Filter store — date / proximity
  const proximityPin = useFilterStore((s) => s.proximityPin);
  const proximityRadiusKm = useFilterStore((s) => s.proximityRadiusKm);
  const isSettingPin = useFilterStore((s) => s.isSettingPin);
  const setProximityPin = useFilterStore((s) => s.setProximityPin);
  const setProximityRadius = useFilterStore((s) => s.setProximityRadius);
  const setSettingPin = useFilterStore((s) => s.setSettingPin);
  const dateStart = useFilterStore((s) => s.dateStart);
  const dateEnd = useFilterStore((s) => s.dateEnd);
  const setDateRange = useFilterStore((s) => s.setDateRange);
  const clearFilter = useFilterStore((s) => s.clearFilter);
  const granularity = useFilterStore((s) => s.granularity);
  const setGranularity = useFilterStore((s) => s.setGranularity);
  const isDefaultWindowActive = useFilterStore((s) => s.isDefaultWindowActive)();

  // Derive available countries from current event data
  const events = useEventStore((s) => s.events);
  const availableEventCountries = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => {
      if (e.data.actor1) set.add(e.data.actor1);
      if (e.data.actor2) set.add(e.data.actor2);
    });
    return Array.from(set).sort();
  }, [events]);

  // Active state per filter section
  const isEventCountryActive = eventCountries.length > 0;
  const isFlightSpeedActive = flightSpeedMin !== null || flightSpeedMax !== null;
  const isAltitudeActive = altitudeMin !== null || altitudeMax !== null;
  const isProximityActive = proximityPin !== null;
  const isDateActive = dateStart !== null || dateEnd !== null;
  const isMentionsActive = mentionsMin !== null || mentionsMax !== null;

  return (
    <div className="flex flex-col gap-3">

      {/* Proximity (global -- applies to all entity types) */}
      <div>
        <SectionHeader label="Proximity" active={isProximityActive} filterKey="proximity" onClear={clearFilter} />
        <div className="mt-1">
          <ProximityFilter
            pin={proximityPin}
            radiusKm={proximityRadiusKm}
            isSettingPin={isSettingPin}
            onSetPin={setProximityPin}
            onClearPin={() => clearFilter('proximity')}
            onRadiusChange={setProximityRadius}
            onStartSettingPin={() => setSettingPin(true)}
          />
        </div>
      </div>

      {/* Flights section */}
      <div>
        <EntitySectionHeader label="Flights" isOpen={isFlightFiltersOpen} onToggle={toggleFlightFilters} />
        {isFlightFiltersOpen && (
          <div className="mt-1.5 flex flex-col gap-2 pl-3">
            {/* Visibility button */}
            <div className="flex flex-wrap gap-1">
              <VisibilityButton label="Flights" active={showFlights} onToggle={toggleFlights} color="#eab308" />
            </div>
            {/* Boolean sub-filters */}
            <BooleanToggle label="Grounded" active={showGroundTraffic} onToggle={toggleGroundTraffic} />
            <BooleanToggle label="Unidentified" active={pulseEnabled} onToggle={togglePulse} />
            {/* Callsign search */}
            <TextSearchInput
              label="Callsign"
              value={flightCallsign}
              onChange={setFlightCallsign}
              placeholder="Filter by callsign..."
            />
            {/* ICAO search */}
            <TextSearchInput
              label="ICAO"
              value={flightIcao}
              onChange={setFlightIcao}
              placeholder="Filter by ICAO hex..."
            />
            {/* Altitude slider */}
            <div>
              <SectionHeader label="Altitude" active={isAltitudeActive} filterKey="altitude" onClear={clearFilter} />
              <div className="mt-1">
                <RangeSlider
                  label="Altitude"
                  min={0}
                  max={60000}
                  step={500}
                  unit="ft"
                  valueMin={altitudeMin}
                  valueMax={altitudeMax}
                  onChangeMin={(v) => setAltitudeRange(v, altitudeMax)}
                  onChangeMax={(v) => setAltitudeRange(altitudeMin, v)}
                />
              </div>
            </div>
            {/* Speed slider */}
            <div>
              <SectionHeader label="Speed" active={isFlightSpeedActive} filterKey="flightSpeed" onClear={clearFilter} />
              <div className="mt-1">
                <RangeSlider
                  label="Speed"
                  min={0}
                  max={700}
                  step={10}
                  unit="kn"
                  valueMin={flightSpeedMin}
                  valueMax={flightSpeedMax}
                  onChangeMin={(v) => setFlightSpeedRange(v, flightSpeedMax)}
                  onChangeMax={(v) => setFlightSpeedRange(flightSpeedMin, v)}
                />
              </div>
            </div>
            {/* Heading slider */}
            <HeadingSlider value={headingAngle} onChange={setHeadingAngle} />
          </div>
        )}
      </div>

      {/* Ships section */}
      <div>
        <EntitySectionHeader label="Ships" isOpen={isShipFiltersOpen} onToggle={toggleShipFilters} />
        {isShipFiltersOpen && (
          <div className="mt-1.5 flex flex-col gap-2 pl-3">
            {/* Visibility button */}
            <div className="flex flex-wrap gap-1">
              <VisibilityButton label="Ships" active={showShips} onToggle={toggleShips} color="#a78bfa" />
            </div>
            {/* MMSI search */}
            <TextSearchInput
              label="MMSI"
              value={shipMmsi}
              onChange={setShipMmsi}
              placeholder="Filter by MMSI..."
            />
            {/* Ship name search */}
            <TextSearchInput
              label="Ship Name"
              value={shipNameFilter}
              onChange={setShipNameFilter}
              placeholder="Filter by name..."
            />
          </div>
        )}
      </div>

      {/* Conflicts section */}
      <div>
        <EntitySectionHeader label="Conflicts" isOpen={isEventFiltersOpen} onToggle={toggleEventFilters} />
        {isEventFiltersOpen && (
          <div className="mt-1.5 flex flex-col gap-2 pl-3">
            {/* Visibility buttons */}
            <div className="flex flex-wrap gap-1">
              <VisibilityButton label="Airstrikes" active={showAirstrikes} onToggle={toggleAirstrikes} color="#ff3b30" />
              <VisibilityButton label="Ground Combat" active={showGroundCombat} onToggle={toggleGroundCombat} color="#ef4444" />
              <VisibilityButton label="Targeted" active={showTargeted} onToggle={toggleTargeted} color="#8b1e1e" />
            </div>

            {/* Severity toggles */}
            <SeverityToggles />

            {/* CAMEO search */}
            <TextSearchInput
              label="CAMEO Code"
              value={cameoCode}
              onChange={setCameoCode}
              placeholder="e.g. 14, 190..."
            />

            {/* Country filter */}
            <div>
              <SectionHeader label="Country" active={isEventCountryActive} filterKey="eventCountry" onClear={clearFilter} />
              <div className="mt-1">
                <CountryFilter
                  selectedCountries={eventCountries}
                  onAdd={addEventCountry}
                  onRemove={removeEventCountry}
                  availableCountries={availableEventCountries}
                />
              </div>
            </div>

            {/* Mentions slider */}
            <div>
              <SectionHeader label="Mentions" active={isMentionsActive} filterKey="mentions" onClear={clearFilter} />
              <div className="mt-1">
                <RangeSlider
                  label="Mentions"
                  min={0}
                  max={500}
                  step={5}
                  valueMin={mentionsMin}
                  valueMax={mentionsMax}
                  onChangeMin={(v) => setMentionsRange(v, mentionsMax)}
                  onChangeMax={(v) => setMentionsRange(mentionsMin, v)}
                />
              </div>
            </div>

            {/* Date range slider */}
            <div>
              <SectionHeader label="Date Range" active={isDateActive} filterKey="date" onClear={clearFilter} />
              {isDefaultWindowActive && (
                <div className="mt-0.5 text-[10px] italic text-text-muted">Showing last 24h</div>
              )}
              <div className="mt-1">
                <DateRangeFilter
                  dateStart={dateStart}
                  dateEnd={dateEnd}
                  granularity={granularity}
                  onDateRange={setDateRange}
                  onGranularity={setGranularity}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sites section */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Sites</div>
        <div className="mt-1.5 flex flex-col gap-2 pl-3">
          {/* Site type visibility buttons */}
          <div className="flex flex-wrap gap-1">
            <VisibilityButton label="Nuclear" active={showNuclear} onToggle={toggleNuclear} color="#22c55e" />
            <VisibilityButton label="Naval" active={showNaval} onToggle={toggleNaval} color="#3b82f6" />
            <VisibilityButton label="Oil" active={showOil} onToggle={toggleOil} color="#f59e0b" />
            <VisibilityButton label="Airbase" active={showAirbase} onToggle={toggleAirbase} color="#8b5cf6" />
            <VisibilityButton label="Desal" active={showDesalination} onToggle={toggleDesalination} color="#06b6d4" />
            <VisibilityButton label="Port" active={showPort} onToggle={togglePort} color="#78716c" />
          </div>
          {/* Status toggles */}
          <BooleanToggle label="Healthy" active={showHealthySites} onToggle={toggleHealthySites} />
          <BooleanToggle label="Attacked" active={showAttackedSites} onToggle={toggleAttackedSites} />
        </div>
      </div>

    </div>
  );
}

export function FilterPanelSlot() {
  const isCollapsed = useUIStore((s) => s.isFiltersCollapsed);
  const isDetailPanelOpen = useUIStore((s) => s.isDetailPanelOpen);
  const toggleFilters = useUIStore((s) => s.toggleFilters);
  const activeFilterCount = useFilterStore((s) => s.activeFilterCount);
  const clearAll = useFilterStore((s) => s.clearAll);

  const activeCount = activeFilterCount();

  return (
    <div
      data-testid="filter-panel-slot"
      className={`absolute top-14 z-[var(--z-controls)] transition-[right] duration-300 ease-in-out max-h-[calc(100vh-4.5rem)] overflow-y-auto ${isDetailPanelOpen ? 'right-[calc(var(--width-detail-panel)+1rem)]' : 'right-4'}`}
    >
      <OverlayPanel>
        <div className="flex flex-col gap-1">
          <button
            onClick={toggleFilters}
            className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-text-secondary"
          >
            <span>
              Filters
              {activeCount > 0 && (
                <span className="ml-1 text-accent-blue">({activeCount})</span>
              )}
            </span>
            <span className="text-text-muted">{isCollapsed ? '+' : '-'}</span>
          </button>
          {!isCollapsed && (
            <div className="mt-1 flex flex-col gap-3">
              <FilterPanelContent />
              {/* Clear all */}
              {activeCount > 0 && (
                <button
                  onClick={clearAll}
                  className="self-start text-[10px] text-accent-red hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      </OverlayPanel>
    </div>
  );
}
