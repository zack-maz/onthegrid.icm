import { useUIStore } from '@/stores/uiStore';
import { OverlayPanel } from '@/components/ui/OverlayPanel';
import { ENTITY_DOT_COLORS } from '@/components/map/layers/constants';

interface ToggleRowProps {
  color: string;
  label: string;
  active: boolean;
  onToggle: () => void;
  indent?: boolean;
  disabled?: boolean;
}

function ToggleRow({ color, label, active, onToggle, indent = false, disabled = false }: ToggleRowProps) {
  return (
    <button
      role="switch"
      aria-checked={active}
      aria-label={`Toggle ${label} visibility`}
      onClick={onToggle}
      disabled={disabled}
      className={`flex w-full items-center gap-2 transition-opacity ${
        disabled ? 'opacity-20 cursor-not-allowed' : active ? 'opacity-100' : 'opacity-40'
      } ${indent ? 'pl-4 text-[10px]' : 'text-xs'}`}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-text-secondary">{label}</span>
    </button>
  );
}

/** Inner content of layer toggles, reusable in Sidebar */
export function LayerTogglesContent() {
  const showFlights = useUIStore((s) => s.showFlights);
  const showGroundTraffic = useUIStore((s) => s.showGroundTraffic);
  const pulseEnabled = useUIStore((s) => s.pulseEnabled);
  const showShips = useUIStore((s) => s.showShips);
  const showEvents = useUIStore((s) => s.showEvents);
  const showAirstrikes = useUIStore((s) => s.showAirstrikes);
  const showGroundCombat = useUIStore((s) => s.showGroundCombat);
  const showTargeted = useUIStore((s) => s.showTargeted);
  const toggleFlights = useUIStore((s) => s.toggleFlights);
  const toggleGroundTraffic = useUIStore((s) => s.toggleGroundTraffic);
  const togglePulse = useUIStore((s) => s.togglePulse);
  const toggleShips = useUIStore((s) => s.toggleShips);
  const toggleEvents = useUIStore((s) => s.toggleEvents);
  const toggleAirstrikes = useUIStore((s) => s.toggleAirstrikes);
  const toggleGroundCombat = useUIStore((s) => s.toggleGroundCombat);
  const toggleTargeted = useUIStore((s) => s.toggleTargeted);
  const showSites = useUIStore((s) => s.showSites);
  const showNuclear = useUIStore((s) => s.showNuclear);
  const showNaval = useUIStore((s) => s.showNaval);
  const showOil = useUIStore((s) => s.showOil);
  const showAirbase = useUIStore((s) => s.showAirbase);
  const showDesalination = useUIStore((s) => s.showDesalination);
  const showPort = useUIStore((s) => s.showPort);
  const showHealthySites = useUIStore((s) => s.showHealthySites);
  const showAttackedSites = useUIStore((s) => s.showAttackedSites);
  const toggleSites = useUIStore((s) => s.toggleSites);
  const toggleNuclear = useUIStore((s) => s.toggleNuclear);
  const toggleNaval = useUIStore((s) => s.toggleNaval);
  const toggleOil = useUIStore((s) => s.toggleOil);
  const toggleAirbase = useUIStore((s) => s.toggleAirbase);
  const toggleDesalination = useUIStore((s) => s.toggleDesalination);
  const togglePort = useUIStore((s) => s.togglePort);
  const toggleHealthySites = useUIStore((s) => s.toggleHealthySites);
  const toggleAttackedSites = useUIStore((s) => s.toggleAttackedSites);

  return (
    <div className="flex flex-col gap-1">
      <ToggleRow color={ENTITY_DOT_COLORS.flights} label="Flights" active={showFlights} onToggle={toggleFlights} />
      <ToggleRow color={ENTITY_DOT_COLORS.ground} label="Ground" active={showGroundTraffic} onToggle={toggleGroundTraffic} indent />
      <ToggleRow color={ENTITY_DOT_COLORS.unidentified} label="Unidentified" active={pulseEnabled} onToggle={togglePulse} indent />
      <ToggleRow color={ENTITY_DOT_COLORS.ships} label="Ships" active={showShips} onToggle={toggleShips} />
      <ToggleRow color={ENTITY_DOT_COLORS.airstrikes} label="Events" active={showEvents} onToggle={toggleEvents} />
      <ToggleRow color={ENTITY_DOT_COLORS.airstrikes} label="Airstrikes" active={showAirstrikes} onToggle={toggleAirstrikes} indent disabled={!showEvents} />
      <ToggleRow color={ENTITY_DOT_COLORS.groundCombat} label="Ground Combat" active={showGroundCombat} onToggle={toggleGroundCombat} indent disabled={!showEvents} />
      <ToggleRow color={ENTITY_DOT_COLORS.targeted} label="Targeted" active={showTargeted} onToggle={toggleTargeted} indent disabled={!showEvents} />
      <ToggleRow color={ENTITY_DOT_COLORS.sites} label="Sites" active={showSites} onToggle={toggleSites} />
      <ToggleRow color={ENTITY_DOT_COLORS.sites} label="Nuclear" active={showNuclear} onToggle={toggleNuclear} indent disabled={!showSites} />
      <ToggleRow color={ENTITY_DOT_COLORS.sites} label="Naval" active={showNaval} onToggle={toggleNaval} indent disabled={!showSites} />
      <ToggleRow color={ENTITY_DOT_COLORS.sites} label="Oil" active={showOil} onToggle={toggleOil} indent disabled={!showSites} />
      <ToggleRow color={ENTITY_DOT_COLORS.sites} label="Airbase" active={showAirbase} onToggle={toggleAirbase} indent disabled={!showSites} />
      <ToggleRow color={ENTITY_DOT_COLORS.sites} label="Desalination" active={showDesalination} onToggle={toggleDesalination} indent disabled={!showSites} />
      <ToggleRow color={ENTITY_DOT_COLORS.sites} label="Port" active={showPort} onToggle={togglePort} indent disabled={!showSites} />
      <ToggleRow color="#22c55e" label="Healthy" active={showHealthySites} onToggle={toggleHealthySites} indent disabled={!showSites} />
      <ToggleRow color="#f97316" label="Attacked" active={showAttackedSites} onToggle={toggleAttackedSites} indent disabled={!showSites} />
      <button
        onClick={() => {
          localStorage.clear();
          document.cookie.split(';').forEach((c) => {
            document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
          });
          window.location.reload();
        }}
        className="mt-2 text-[10px] text-red-400 hover:text-red-300 opacity-60 hover:opacity-100 transition-opacity"
      >
        Clear cache & reload
      </button>
    </div>
  );
}

export function LayerTogglesSlot() {
  const isCollapsed = useUIStore((s) => s.isLayersCollapsed);
  const toggleLayers = useUIStore((s) => s.toggleLayers);

  return (
    <div data-testid="layer-toggles-slot">
      <OverlayPanel>
        <div className="flex flex-col gap-1">
          <button
            onClick={toggleLayers}
            className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-text-secondary"
          >
            <span>Layers</span>
            <span className="text-text-muted">{isCollapsed ? '+' : '-'}</span>
          </button>
          {!isCollapsed && <LayerTogglesContent />}
        </div>
      </OverlayPanel>
    </div>
  );
}
