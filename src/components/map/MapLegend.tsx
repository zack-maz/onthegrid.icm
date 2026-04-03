import { useLayerStore, type VisualizationLayerId } from '@/stores/layerStore';
import { useUIStore } from '@/stores/uiStore';

export interface LegendConfig {
  layerId: VisualizationLayerId;
  title: string;
  colorStops: Array<{ color: string; label: string }>;
  /** 'gradient' renders a gradient bar (default), 'discrete' renders individual color swatches */
  mode?: 'gradient' | 'discrete';
}

/**
 * Registry of legend configurations for visualization layers.
 * Uses a Map keyed by layerId to prevent duplicates during HMR re-evaluation.
 */
const _registry = new Map<VisualizationLayerId, LegendConfig>();

export const LEGEND_REGISTRY = {
  push(config: LegendConfig) {
    _registry.set(config.layerId, config);
  },
  filter(fn: (config: LegendConfig) => boolean): LegendConfig[] {
    return Array.from(_registry.values()).filter(fn);
  },
  find(fn: (config: LegendConfig) => boolean): LegendConfig | undefined {
    for (const config of _registry.values()) {
      if (fn(config)) return config;
    }
    return undefined;
  },
  get length(): number {
    return _registry.size;
  },
};

// Geographic elevation legend (Phase 20.1)
LEGEND_REGISTRY.push({
  layerId: 'geographic',
  title: 'Elevation',
  colorStops: [
    { color: '#1a1a2e', label: '0m' },
    { color: '#334155', label: '1500m' },
    { color: '#94a3b8', label: '4000m' },
  ],
});

// Temperature legend (Phase 20.1 - Weather layer)
LEGEND_REGISTRY.push({
  layerId: 'weather',
  title: 'Temperature',
  colorStops: [
    { color: 'rgb(0, 100, 255)', label: '-5C / 23F' },
    { color: 'rgb(0, 200, 100)', label: '15C / 59F' },
    { color: 'rgb(255, 220, 0)', label: '30C / 86F' },
    { color: 'rgb(255, 50, 0)', label: '45C / 113F' },
  ],
});

// Water Health legend (Phase 26 - Water layer)
LEGEND_REGISTRY.push({
  layerId: 'water',
  title: 'Water Health',
  colorStops: [
    { color: '#000000', label: 'Extreme Stress' },
    { color: '#1e3a5f', label: '' },
    { color: '#3b82b4', label: '' },
    { color: '#7dd3fc', label: 'Healthy' },
  ],
});

// Factions legend (Phase 24 - Political layer)
LEGEND_REGISTRY.push({
  layerId: 'political',
  title: 'Factions',
  mode: 'discrete',
  colorStops: [
    { color: '#3b82f6', label: 'US-aligned' },
    { color: '#dc2626', label: 'Iran-aligned' },
    { color: '#64748b', label: 'Neutral' },
    { color: '#f59e0b', label: 'Disputed' },
  ],
});

function LegendItem({ config }: { config: LegendConfig }) {
  if (config.mode === 'discrete') {
    return (
      <div className="pointer-events-auto rounded bg-surface-overlay/80 px-2 py-1.5 backdrop-blur-sm">
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-text-secondary">
          {config.title}
        </div>
        <div className="flex flex-col gap-0.5">
          {config.colorStops.map((stop) => (
            <div key={stop.label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: stop.color }}
              />
              <span className="text-[8px] text-text-muted">{stop.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const gradient = config.colorStops
    .map((stop) => stop.color)
    .join(', ');

  return (
    <div className="pointer-events-auto rounded bg-surface-overlay/80 px-2 py-1.5 backdrop-blur-sm">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-text-secondary">
        {config.title}
      </div>
      <div
        className="h-2 w-32 rounded-sm"
        style={{ background: `linear-gradient(to right, ${gradient})` }}
      />
      <div className="mt-0.5 flex justify-between text-[8px] text-text-muted">
        <span>{config.colorStops[0]?.label}</span>
        <span>{config.colorStops[config.colorStops.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/**
 * Memoizing selector: caches the filtered result and only returns a new
 * reference when the set of active legend layers actually changes.
 * This satisfies React's useSyncExternalStore stability requirement.
 */
let _cachedLegends: LegendConfig[] = [];
const selectActiveLegends = (s: { activeLayers: Set<VisualizationLayerId> }): LegendConfig[] => {
  const next = LEGEND_REGISTRY.filter((l) => s.activeLayers.has(l.layerId));
  if (
    next.length === _cachedLegends.length &&
    next.every((v, i) => v === _cachedLegends[i])
  ) {
    return _cachedLegends;
  }
  _cachedLegends = next;
  return next;
};

export function MapLegend() {
  const activeLegends = useLayerStore(selectActiveLegends);
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);

  if (activeLegends.length === 0) return null;

  // Offset past sidebar: icon strip (48px) + gap (8px), plus sidebar width (280px) when open
  const leftOffset = isSidebarOpen ? 'calc(var(--width-icon-strip) + var(--width-sidebar) + 8px)' : 'calc(var(--width-icon-strip) + 8px)';

  return (
    <div
      className="absolute bottom-4 z-[var(--z-controls)] pointer-events-none flex flex-col gap-2 transition-[left] duration-300 ease-in-out"
      style={{ left: leftOffset }}
    >
      {activeLegends.map((legend) => (
        <div
          key={legend.layerId}
          className="transition-opacity duration-300"
        >
          <LegendItem config={legend} />
        </div>
      ))}
    </div>
  );
}
