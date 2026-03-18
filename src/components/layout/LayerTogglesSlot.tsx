import { useUIStore } from '@/stores/uiStore';
import { OverlayPanel } from '@/components/ui/OverlayPanel';
import { ENTITY_DOT_COLORS } from '@/components/map/layers/constants';

interface ToggleRowProps {
  color: string;
  label: string;
  active: boolean;
  onToggle: () => void;
  indent?: boolean;
}

function ToggleRow({ color, label, active, onToggle, indent = false }: ToggleRowProps) {
  return (
    <button
      role="switch"
      aria-checked={active}
      aria-label={`Toggle ${label} visibility`}
      onClick={onToggle}
      className={`flex w-full items-center gap-2 transition-opacity ${
        active ? 'opacity-100' : 'opacity-40'
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

export function LayerTogglesSlot() {
  const showFlights = useUIStore((s) => s.showFlights);
  const showGroundTraffic = useUIStore((s) => s.showGroundTraffic);
  const pulseEnabled = useUIStore((s) => s.pulseEnabled);
  const showShips = useUIStore((s) => s.showShips);
  const showDrones = useUIStore((s) => s.showDrones);
  const showMissiles = useUIStore((s) => s.showMissiles);
  const showNews = useUIStore((s) => s.showNews);

  const toggleFlights = useUIStore((s) => s.toggleFlights);
  const toggleGroundTraffic = useUIStore((s) => s.toggleGroundTraffic);
  const togglePulse = useUIStore((s) => s.togglePulse);
  const toggleShips = useUIStore((s) => s.toggleShips);
  const toggleDrones = useUIStore((s) => s.toggleDrones);
  const toggleMissiles = useUIStore((s) => s.toggleMissiles);
  const toggleNews = useUIStore((s) => s.toggleNews);

  return (
    <div data-testid="layer-toggles-slot">
      <OverlayPanel>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Layers
          </span>
          <ToggleRow color={ENTITY_DOT_COLORS.flights} label="Flights" active={showFlights} onToggle={toggleFlights} />
          <ToggleRow color={ENTITY_DOT_COLORS.ground} label="Ground" active={showGroundTraffic} onToggle={toggleGroundTraffic} indent />
          <ToggleRow color={ENTITY_DOT_COLORS.unidentified} label="Unidentified" active={pulseEnabled} onToggle={togglePulse} indent />
          <ToggleRow color={ENTITY_DOT_COLORS.ships} label="Ships" active={showShips} onToggle={toggleShips} />
          <ToggleRow color={ENTITY_DOT_COLORS.drones} label="Drones" active={showDrones} onToggle={toggleDrones} />
          <ToggleRow color={ENTITY_DOT_COLORS.missiles} label="Missiles" active={showMissiles} onToggle={toggleMissiles} />
          <ToggleRow color={ENTITY_DOT_COLORS.news} label="News" active={showNews} onToggle={toggleNews} />
        </div>
      </OverlayPanel>
    </div>
  );
}
