import { useUIStore } from '@/stores/uiStore';
import { useLayerStore, type VisualizationLayerId } from '@/stores/layerStore';
import { OverlayPanel } from '@/components/ui/OverlayPanel';

interface ToggleRowProps {
  color: string;
  label: string;
  active: boolean;
  onToggle: () => void;
}

function ToggleRow({ color, label, active, onToggle }: ToggleRowProps) {
  return (
    <button
      role="switch"
      aria-checked={active}
      aria-label={`Toggle ${label} layer`}
      onClick={onToggle}
      className={`flex w-full items-center gap-2 text-xs transition-opacity ${
        active ? 'opacity-100' : 'opacity-40'
      }`}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-text-secondary">{label}</span>
    </button>
  );
}

const LAYER_CONFIGS: { id: VisualizationLayerId; label: string; color: string }[] = [
  { id: 'geographic', label: 'Geographic', color: '#94a3b8' },
  { id: 'weather', label: 'Weather', color: '#38bdf8' },
  { id: 'threat', label: 'Threat Heatmap', color: '#ef4444' },
  { id: 'political', label: 'Political', color: '#a78bfa' },
  { id: 'satellite', label: 'Satellite', color: '#22d3ee' },
  { id: 'infrastructure', label: 'Infrastructure', color: '#4ade80' },
];

/** Wraps ToggleRow with a store-connected hook (avoids calling useLayerStore inside .map) */
function LayerToggleRow({ id, label, color }: { id: VisualizationLayerId; label: string; color: string }) {
  const active = useLayerStore((s) => s.activeLayers.has(id));
  return (
    <ToggleRow
      color={color}
      label={label}
      active={active}
      onToggle={() => useLayerStore.getState().toggleLayer(id)}
    />
  );
}

/** Inner content of layer toggles, reusable in Sidebar */
export function LayerTogglesContent() {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] text-text-muted">Visualization overlays (coming soon)</span>
      {LAYER_CONFIGS.map(({ id, label, color }) => (
        <LayerToggleRow key={id} id={id} label={label} color={color} />
      ))}
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
