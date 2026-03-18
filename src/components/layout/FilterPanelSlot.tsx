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

export function FilterPanelSlot() {
  const isCollapsed = useUIStore((s) => s.isFiltersCollapsed);
  const isDetailPanelOpen = useUIStore((s) => s.isDetailPanelOpen);
  const toggleFilters = useUIStore((s) => s.toggleFilters);
  const isFlightFiltersOpen = useUIStore((s) => s.isFlightFiltersOpen);
  const isShipFiltersOpen = useUIStore((s) => s.isShipFiltersOpen);
  const isEventFiltersOpen = useUIStore((s) => s.isEventFiltersOpen);
  const toggleFlightFilters = useUIStore((s) => s.toggleFlightFilters);
  const toggleShipFilters = useUIStore((s) => s.toggleShipFilters);
  const toggleEventFilters = useUIStore((s) => s.toggleEventFilters);

  const flightCountries = useFilterStore((s) => s.flightCountries);
  const addFlightCountry = useFilterStore((s) => s.addFlightCountry);
  const removeFlightCountry = useFilterStore((s) => s.removeFlightCountry);
  const eventCountries = useFilterStore((s) => s.eventCountries);
  const addEventCountry = useFilterStore((s) => s.addEventCountry);
  const removeEventCountry = useFilterStore((s) => s.removeEventCountry);
  const flightSpeedMin = useFilterStore((s) => s.flightSpeedMin);
  const flightSpeedMax = useFilterStore((s) => s.flightSpeedMax);
  const setFlightSpeedRange = useFilterStore((s) => s.setFlightSpeedRange);
  const shipSpeedMin = useFilterStore((s) => s.shipSpeedMin);
  const shipSpeedMax = useFilterStore((s) => s.shipSpeedMax);
  const setShipSpeedRange = useFilterStore((s) => s.setShipSpeedRange);
  const altitudeMin = useFilterStore((s) => s.altitudeMin);
  const altitudeMax = useFilterStore((s) => s.altitudeMax);
  const setAltitudeRange = useFilterStore((s) => s.setAltitudeRange);
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
  const clearAll = useFilterStore((s) => s.clearAll);
  const activeFilterCount = useFilterStore((s) => s.activeFilterCount);

  const activeCount = activeFilterCount();

  // Derive available countries from current entity data
  const flights = useFlightStore((s) => s.flights);
  const events = useEventStore((s) => s.events);
  const availableFlightCountries = useMemo(() => {
    const set = new Set<string>();
    flights.forEach((f) => {
      if (f.data.originCountry) set.add(f.data.originCountry);
    });
    return Array.from(set).sort();
  }, [flights]);

  const availableEventCountries = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => {
      if (e.data.actor1) set.add(e.data.actor1);
      if (e.data.actor2) set.add(e.data.actor2);
    });
    return Array.from(set).sort();
  }, [events]);

  // Active state per filter
  const isFlightCountryActive = flightCountries.length > 0;
  const isEventCountryActive = eventCountries.length > 0;
  const isFlightSpeedActive = flightSpeedMin !== null || flightSpeedMax !== null;
  const isShipSpeedActive = shipSpeedMin !== null || shipSpeedMax !== null;
  const isAltitudeActive = altitudeMin !== null || altitudeMax !== null;
  const isProximityActive = proximityPin !== null;
  const isDateActive = dateStart !== null || dateEnd !== null;

  return (
    <div
      data-testid="filter-panel-slot"
      className={`absolute top-4 z-[var(--z-controls)] transition-[right] duration-300 ease-in-out max-h-[calc(100vh-2rem)] overflow-y-auto ${isDetailPanelOpen ? 'right-[calc(var(--width-detail-panel)+1rem)]' : 'right-4'}`}
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
              {/* Proximity (global — applies to all entity types) */}
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

              {/* ── Flights section ─────────────────────────────────── */}
              <div>
                <EntitySectionHeader label="Flights" isOpen={isFlightFiltersOpen} onToggle={toggleFlightFilters} />
                {isFlightFiltersOpen && (
                  <div className="mt-1.5 flex flex-col gap-2 pl-3">
                    <div>
                      <SectionHeader label="Country" active={isFlightCountryActive} filterKey="flightCountry" onClear={clearFilter} />
                      <div className="mt-1">
                        <CountryFilter
                          selectedCountries={flightCountries}
                          onAdd={addFlightCountry}
                          onRemove={removeFlightCountry}
                          availableCountries={availableFlightCountries}
                        />
                      </div>
                    </div>
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
                  </div>
                )}
              </div>

              {/* ── Ships section ───────────────────────────────────── */}
              <div>
                <EntitySectionHeader label="Ships" isOpen={isShipFiltersOpen} onToggle={toggleShipFilters} />
                {isShipFiltersOpen && (
                  <div className="mt-1.5 flex flex-col gap-2 pl-3">
                    <div>
                      <SectionHeader label="Speed" active={isShipSpeedActive} filterKey="shipSpeed" onClear={clearFilter} />
                      <div className="mt-1">
                        <RangeSlider
                          label="Speed"
                          min={0}
                          max={30}
                          step={1}
                          unit="kn"
                          valueMin={shipSpeedMin}
                          valueMax={shipSpeedMax}
                          onChangeMin={(v) => setShipSpeedRange(v, shipSpeedMax)}
                          onChangeMax={(v) => setShipSpeedRange(shipSpeedMin, v)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Events section ──────────────────────────────────── */}
              <div>
                <EntitySectionHeader label="Events" isOpen={isEventFiltersOpen} onToggle={toggleEventFilters} />
                {isEventFiltersOpen && (
                  <div className="mt-1.5 flex flex-col gap-2 pl-3">
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
                    <div>
                      <SectionHeader label="Date Range" active={isDateActive} filterKey="date" onClear={clearFilter} />
                      <div className="mt-1">
                        <DateRangeFilter
                          dateStart={dateStart}
                          dateEnd={dateEnd}
                          onDateRange={setDateRange}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

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
