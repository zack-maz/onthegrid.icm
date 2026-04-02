# Phase 23: Threat Density Improvements - Research

**Researched:** 2026-04-02
**Domain:** deck.gl HeatmapLayer visualization, grid-based spatial clustering, detail panel integration
**Confidence:** HIGH

## Summary

Phase 23 transforms the existing threat heatmap from a basic red-only overlay into a more accurate and interactive visualization. The work spans five distinct areas: (1) replacing the 5-stop all-red palette with an 8-stop military thermal palette (FLIR Ironbow style), (2) reducing grid resolution from 0.75 degrees to 0.25 degrees for higher spatial fidelity, (3) implementing P90 global normalization via deck.gl's `colorDomain` prop, (4) merging adjacent non-empty grid cells into connected-component clusters, and (5) making clusters clickable to open the DetailPanelSlot with a scrollable event list.

The existing `ThreatHeatmapOverlay.tsx` is the primary file to modify. It already contains `computeThreatWeight`, `aggregateToGrid`, `useThreatHeatmapLayers`, `ThreatTooltip`, and legend registration. The deck.gl HeatmapLayer (v9.2.11) natively supports `colorDomain` for stable normalization independent of viewport, which directly enables the P90 approach without custom shader work. The connected-component clustering is a pure-function addition to `aggregateToGrid` output. The cluster detail panel follows the existing pattern of entity selection via `selectEntity` + `openDetailPanel` in `uiStore`.

**Primary recommendation:** Modify `ThreatHeatmapOverlay.tsx` in-place, adding P90 computation and cluster merging as pure functions. Use deck.gl's `colorDomain` prop for normalization. Add a `ThreatClusterDetail` component to the DetailPanelSlot alongside existing per-type detail views.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Color Palette**: 8-stop military thermal palette (dark blue/purple cold/low through yellow through orange to bright red hot/high). Opacity stays at 45% uniform. Legend keeps minimal 2-stop format (Low / High) with new start/end colors. Thermal palette applies to heatmap overlay only.
- **Temporal Behavior**: Remove 6h temporal decay from `computeThreatWeight`. Weight is purely severity-based: typeWeight x log2(mentions) x log2(sources) x fatalityBoost x goldsteinHostility. No pulse/glow animation.
- **Normalization**: P90 of all visible event weights as color scale max. Events above P90 render at max thermal color. P90 recomputes dynamically when filters/search change. P90 does NOT change with zoom or viewport.
- **Zoom Behavior**: Static radiusPixels. No zoom-responsive radius or picker radius.
- **Grid & Clustering**: Grid resolution from 0.75 degrees to 0.25 degrees (~28km cells). Adjacent non-empty cells merged into connected-component clusters. Each cluster is one pickable entity with aggregated tooltip data.
- **Cluster Interaction**: Click opens DetailPanelSlot (360px right slide-out). Header: "Threat Cluster -- N events". Scrollable list of individual event cards. Clicking individual event flies to it and opens that event's detail panel (replaces cluster panel, no back button this phase).

### Claude's Discretion
- Specific 8-color hex values for the thermal palette
- Grid cell merging algorithm (flood fill, union-find, etc.)
- Exact radiusPixels value (currently 40, may tune)
- HeatmapLayer configuration tuning (intensity, threshold)
- How to compute P90 efficiently in the useMemo chain

### Deferred Ideas (OUT OF SCOPE)
- Detail panel navigation stack / back button (Phase 23.1)
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @deck.gl/aggregation-layers | 9.2.11 | HeatmapLayer for threat visualization | Already in use; native `colorDomain` prop enables P90 normalization |
| @deck.gl/layers | 9.2.11 | ScatterplotLayer for invisible picker | Already in use for threat-picker click handling |
| zustand | 5.0.11 | State management for cluster selection | Existing pattern; `uiStore` handles entity selection |
| react | 19.1.0 | UI framework | Existing |
| vitest | 4.1.0 | Test framework | Existing |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No new dependencies | - | - | All changes use existing libraries |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BFS flood fill | Union-Find (disjoint set) | Union-Find is faster for large grids O(alpha(n)) but BFS is simpler and grid is small (~2000 cells max at 0.25 deg). BFS recommended for clarity. |
| Manual P90 sort | d3-array quantile | Adds dependency; manual sort + index is trivial for < 2000 values |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  components/
    map/
      layers/
        ThreatHeatmapOverlay.tsx  # Modified: palette, grid, P90, clustering
    detail/
      ThreatClusterDetail.tsx     # NEW: cluster detail view for DetailPanelSlot
    layout/
      DetailPanelSlot.tsx         # Modified: add cluster content type
  hooks/
    useSelectedEntity.ts          # Modified: handle cluster pseudo-entity
  types/
    entities.ts                   # Re-exports (may need ThreatCluster type)
```

### Pattern 1: P90 Normalization via colorDomain
**What:** Compute the 90th percentile of all visible event weights, then pass `colorDomain: [0, p90Value]` to HeatmapLayer. This clamps the color scale so the top 10% of events saturate at max color, while the bottom 90% get distributed across the full palette.
**When to use:** Always, when the threat layer is active.
**Example:**
```typescript
// Source: deck.gl HeatmapLayer API docs
// colorDomain: Controls weight-to-color mapping as [minValue, maxValue]
// When specified, threshold is ignored and colors are linearly interpolated

function computeP90(weights: number[]): number {
  if (weights.length === 0) return 1;
  const sorted = [...weights].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.9) - 1;
  return sorted[Math.max(0, index)] || 1;
}

// In useMemo:
const p90 = computeP90(weightedData.map(d => d.weight));
const heatmapLayer = new HeatmapLayer({
  colorDomain: [0, p90],
  // threshold is ignored when colorDomain is set
  ...otherProps,
});
```

### Pattern 2: Connected-Component Cluster Merging (BFS)
**What:** After `aggregateToGrid` produces individual grid cells, merge spatially adjacent cells into clusters using BFS flood fill on the 4-connected grid neighborhood.
**When to use:** After grid aggregation, before creating the picker layer.
**Example:**
```typescript
function mergeClusters(cells: ThreatZoneData[], cellSize: number): ThreatCluster[] {
  const cellMap = new Map<string, ThreatZoneData>();
  for (const cell of cells) {
    cellMap.set(`${cell.lat},${cell.lng}`, cell);
  }

  const visited = new Set<string>();
  const clusters: ThreatCluster[] = [];

  for (const cell of cells) {
    const key = `${cell.lat},${cell.lng}`;
    if (visited.has(key)) continue;

    // BFS to find all connected cells
    const queue = [cell];
    const clusterCells: ThreatZoneData[] = [];
    visited.add(key);

    while (queue.length > 0) {
      const current = queue.shift()!;
      clusterCells.push(current);

      // 4-connected neighbors (N, S, E, W)
      const neighbors = [
        { lat: current.lat + cellSize, lng: current.lng },
        { lat: current.lat - cellSize, lng: current.lng },
        { lat: current.lat, lng: current.lng + cellSize },
        { lat: current.lat, lng: current.lng - cellSize },
      ];

      for (const n of neighbors) {
        const nKey = `${n.lat},${n.lng}`;
        if (!visited.has(nKey) && cellMap.has(nKey)) {
          visited.add(nKey);
          queue.push(cellMap.get(nKey)!);
        }
      }
    }

    clusters.push(aggregateCluster(clusterCells));
  }

  return clusters;
}
```

### Pattern 3: Cluster as Pseudo-Entity in DetailPanel
**What:** Store selected cluster data in a temporary ref or uiStore extension, then render a `ThreatClusterDetail` component when the selected "entity" is a cluster.
**When to use:** When a threat cluster picker is clicked.
**Example:**
```typescript
// In BaseMap.tsx handleDeckClick:
if (info.layer?.id === 'threat-cluster-picker') {
  const cluster = info.object as ThreatCluster;
  // Store cluster in a ref or dedicated state
  setSelectedCluster(cluster);
  openDetailPanel();
  return;
}
```

### Anti-Patterns to Avoid
- **Storing clusters in eventStore**: Clusters are derived data, not source data. Keep them in useMemo within ThreatHeatmapOverlay or a dedicated hook.
- **Using entity IDs for clusters**: Clusters have no stable ID (they recompute on filter change). Use a separate selection mechanism rather than `selectEntity`.
- **Floating-point grid key comparison**: Grid cell coordinates may have floating-point precision issues. Round to fixed decimal places when creating grid keys.
- **Recomputing P90 on every render**: P90 depends only on filtered events and their weights. Keep it inside the same useMemo that computes weightedData.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Color normalization | Custom shader or manual color interpolation | deck.gl `colorDomain` prop | Native HeatmapLayer feature; handles interpolation, is GPU-accelerated |
| Percentile calculation | Complex statistical library | Simple sort + index lookup | Only ~2000 values max; O(n log n) sort is negligible |
| Grid adjacency detection | Spatial index (R-tree, k-d tree) | Map key lookup with 4-neighbor offsets | Grid is regular; Map.has() is O(1), no spatial index needed |

**Key insight:** The deck.gl HeatmapLayer already does the hard work of kernel density estimation and color interpolation. P90 normalization just requires computing one number and passing it as `colorDomain[1]`. The clustering is a graph algorithm on a small regular grid, not a spatial problem.

## Common Pitfalls

### Pitfall 1: Floating-Point Grid Key Mismatch
**What goes wrong:** Grid cell coordinates computed as `Math.floor(lat / 0.25) * 0.25 + 0.125` may produce values like `33.124999999999` instead of `33.125`, causing neighbor lookups to fail.
**Why it happens:** IEEE 754 floating-point arithmetic is not exact.
**How to avoid:** Round grid cell coordinates to a fixed number of decimal places (e.g., 4) when creating keys, OR use integer-based grid indices (`Math.floor(lat / cellSize)`) as keys and compute coordinates only for rendering.
**Warning signs:** Clusters that should merge remain as separate single-cell clusters.

### Pitfall 2: colorDomain with SUM Aggregation
**What goes wrong:** When `aggregation: 'SUM'` is used, `colorDomain` values are interpreted as "weight per square meter" by deck.gl, which can lead to unexpected color mapping.
**Why it happens:** deck.gl normalizes by area in SUM mode.
**How to avoid:** Tune the `colorDomain` values empirically. Start with `[0, p90]` and adjust. If colors don't distribute well, multiply the domain by a scaling factor. The `intensity` prop can also help: values > 1 bias toward the hot end.
**Warning signs:** Entire heatmap appears as one flat color, or very little color variation.

### Pitfall 3: Cluster Picker Layer Sizing
**What goes wrong:** ScatterplotLayer picker circles for clusters are too small or too large, causing click targets to overlap or miss.
**Why it happens:** Cluster geographic extent varies; a single fixed radius doesn't fit all clusters.
**How to avoid:** Size each cluster's picker circle proportional to its bounding box. Compute the maximum lat/lng extent of the cluster's cells and set the radius to half the diagonal distance. Minimum radius stays at 50km (current single-cell value) or the cell diagonal.
**Warning signs:** Clicking near the edge of a large cluster doesn't register; clicking between two nearby clusters selects the wrong one.

### Pitfall 4: P90 Producing Zero or Very Small Values
**What goes wrong:** If most events have very low weights (e.g., minor assaults), P90 could be near zero, causing the entire heatmap to saturate at max color.
**Why it happens:** Skewed weight distribution where the top 10% and bottom 90% are all low.
**How to avoid:** Clamp P90 to a minimum meaningful value (e.g., `Math.max(p90, 1)`). This prevents division-by-zero-like behavior in the color interpolation.
**Warning signs:** All grid cells appear the same bright red/white color.

### Pitfall 5: Cluster Detail Panel and Entity Selection Conflict
**What goes wrong:** Opening a cluster detail panel via `openDetailPanel()` while `selectedEntityId` points to a real entity (or null) causes the DetailPanelSlot to render the wrong content.
**Why it happens:** The existing pattern ties DetailPanelSlot content to `selectedEntityId` in uiStore.
**How to avoid:** Add a `selectedClusterId` (or store the cluster data directly) separate from `selectedEntityId`. When a cluster is selected, set `selectedClusterId` and clear `selectedEntityId`. DetailPanelSlot checks cluster first, then entity.
**Warning signs:** Clicking a cluster shows "Select an entity on the map" or shows the previously selected entity's details.

## Code Examples

### Military Thermal Color Palette (8 stops, FLIR Ironbow-inspired)
```typescript
// Source: FLIR Ironbow palette analysis + user requirement for dark blue/purple to bright red
// The FLIR Ironbow goes: black -> dark blue -> purple -> magenta -> red -> orange -> yellow -> white
// Adapted: drop black/white extremes, start dark indigo, end bright red

const THERMAL_COLOR_RANGE: [number, number, number][] = [
  [10, 0, 60],       // #0a003c  deep indigo (coldest)
  [40, 0, 110],      // #28006e  dark purple
  [100, 0, 150],     // #640096  violet
  [170, 0, 120],     // #aa0078  magenta
  [220, 40, 60],     // #dc283c  crimson
  [255, 140, 20],    // #ff8c14  orange
  [255, 220, 15],    // #ffdc0f  yellow-orange
  [255, 60, 30],     // #ff3c1e  bright red (hottest)
];
```

Note: The exact hex values are Claude's discretion per CONTEXT.md. The palette above is one option following the FLIR Ironbow thermal progression. An alternative ordering places bright red at the end for maximum "danger" feel:
```typescript
// Alternative: ends at bright fire-red instead of returning to red after yellow
const THERMAL_COLOR_RANGE_ALT: [number, number, number][] = [
  [10, 0, 60],       // deep indigo
  [50, 0, 120],      // dark purple
  [120, 0, 140],     // violet-magenta
  [180, 20, 80],     // rose-crimson
  [220, 80, 20],     // deep orange
  [250, 160, 0],     // amber
  [255, 220, 30],    // golden yellow
  [255, 50, 20],     // bright red (max threat)
];
```

### P90 Computation
```typescript
// Pure function, no dependencies
function computeP90(weights: number[]): number {
  if (weights.length === 0) return 1;
  const sorted = [...weights].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.9) - 1;
  return Math.max(sorted[idx] ?? 1, 1); // floor at 1 to avoid degenerate domain
}
```

### Updated computeThreatWeight (decay removed)
```typescript
// Source: CONTEXT.md locked decision — remove temporal decay
export function computeThreatWeight(event: ConflictEventEntity): number {
  const typeWeight = TYPE_WEIGHTS[event.type] ?? 3;
  const mentions = event.data.numMentions ?? 1;
  const sources = event.data.numSources ?? 1;
  const fatalities = event.data.fatalities ?? 0;
  const goldstein = event.data.goldsteinScale ?? 0;

  const mediaFactor = Math.log2(1 + mentions) * Math.log2(1 + sources);
  const fatalityFactor = 1 + fatalities * 0.5;
  const goldsteinFactor = 1.5 - goldstein / 20;

  return typeWeight * mediaFactor * fatalityFactor * goldsteinFactor;
  // temporal decay REMOVED per user decision
}
```

### ThreatCluster Type
```typescript
export interface ThreatCluster {
  id: string;               // Deterministic from cell coordinates
  centroidLat: number;      // Weighted centroid of cluster cells
  centroidLng: number;
  cells: ThreatZoneData[];  // Individual grid cells in this cluster
  eventCount: number;       // Sum of all cell event counts
  totalWeight: number;      // Sum of all cell weights
  dominantType: string;     // Most frequent event type across cluster
  totalFatalities: number;
  latestTime: number;
  boundingBox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  eventIds: string[];       // IDs of all events in this cluster (for detail panel lookup)
}
```

### Legend Update
```typescript
// Replace existing legend registration
LEGEND_REGISTRY.push({
  layerId: 'threat',
  title: 'Threat Density',
  colorStops: [
    { color: '#0a003c', label: 'Low' },   // First thermal stop
    { color: '#ff3c1e', label: 'High' },   // Last thermal stop
  ],
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 5-stop red palette | 8-stop thermal (this phase) | Phase 23 | Better visual differentiation of threat levels |
| 0.75-degree grid | 0.25-degree grid (this phase) | Phase 23 | ~9x more cells, finer spatial resolution |
| Auto viewport normalization | P90 global normalization (this phase) | Phase 23 | Consistent colors regardless of zoom |
| Individual cell tooltips only | Connected-component clusters (this phase) | Phase 23 | Meaningful aggregation of adjacent threat zones |
| Temporal decay in weight | Pure severity weight (this phase) | Phase 23 | Date range filter handles recency instead |

**Deprecated/outdated:**
- `HALF_LIFE_HOURS` constant: Remove (temporal decay eliminated)
- Current `THREAT_COLOR_RANGE` (5-stop red): Replace with 8-stop thermal
- Current `CELL_SIZE_DEG = 0.75`: Replace with 0.25

## Open Questions

1. **Cluster ID stability across filter changes**
   - What we know: Clusters are derived from filtered events. When filters change, cluster composition changes. There's no stable cluster ID.
   - What's unclear: If the user has a cluster detail panel open and applies a filter that changes clusters, should the panel close, or attempt to show updated data?
   - Recommendation: Close the cluster detail panel when filters change (simplest, matches how entity selection works when an entity disappears). This is consistent with the "lost contact" pattern.

2. **Picker layer: one per cluster vs. one per cell**
   - What we know: Currently there's one ScatterplotLayer with one circle per grid cell. With clustering, we could either (a) keep one circle per cell but associate each with its parent cluster, or (b) create one large circle per cluster.
   - What's unclear: Which gives better click UX.
   - Recommendation: One circle per cluster centered at the cluster centroid, with radius proportional to bounding box. This gives a single click target per cluster and avoids multiple overlapping circles.

3. **Event ID tracking through aggregation**
   - What we know: `aggregateToGrid` currently doesn't track individual event IDs. The cluster detail panel needs to list individual events.
   - What's unclear: Whether to store event IDs during grid aggregation or re-derive them from the filtered events list using spatial lookup.
   - Recommendation: Store event IDs during `aggregateToGrid` (add `eventIds: string[]` to ThreatZoneData). Small memory overhead, avoids expensive re-lookup.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | vite.config.ts (test section) |
| Quick run command | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P23-01 | 8-stop thermal palette in HeatmapLayer config | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | Partial (existing tests check old palette) |
| P23-02 | computeThreatWeight has no temporal decay | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | Partial (existing tests verify decay; need inversion) |
| P23-03 | aggregateToGrid uses 0.25-degree cells | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | Partial (existing tests verify 0.75-degree) |
| P23-04 | P90 computes correctly for various distributions | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | No (new function) |
| P23-05 | HeatmapLayer receives colorDomain=[0, p90] | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | No (new behavior) |
| P23-06 | mergeClusters produces correct connected components | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | No (new function) |
| P23-07 | Cluster click opens DetailPanelSlot with cluster content | unit | `npx vitest run src/__tests__/ThreatClusterDetail.test.tsx -x` | No (new component) |
| P23-08 | Event click within cluster opens EventDetail | unit | `npx vitest run src/__tests__/ThreatClusterDetail.test.tsx -x` | No (new behavior) |
| P23-09 | Legend updated with thermal palette colors | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | Partial (existing test checks old colors) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Update existing `computeThreatWeight` tests to expect no temporal decay (P23-02)
- [ ] Update existing `aggregateToGrid` tests for 0.25-degree cell size (P23-03)
- [ ] Add `computeP90` test suite (P23-04)
- [ ] Add `mergeClusters` test suite (P23-06)
- [ ] Create `src/__tests__/ThreatClusterDetail.test.tsx` (P23-07, P23-08)
- [ ] Update legend test expectations (P23-09)

## Sources

### Primary (HIGH confidence)
- deck.gl HeatmapLayer API docs (https://deck.gl/docs/api-reference/aggregation-layers/heatmap-layer) - colorDomain, colorRange, intensity, threshold, aggregation props
- Existing codebase: `src/components/map/layers/ThreatHeatmapOverlay.tsx` - current implementation
- Existing codebase: `src/__tests__/ThreatHeatmapOverlay.test.tsx` - current test coverage
- Existing codebase: `src/components/layout/DetailPanelSlot.tsx` - detail panel pattern
- Existing codebase: `src/hooks/useSelectedEntity.ts` - entity selection pattern

### Secondary (MEDIUM confidence)
- FLIR Ironbow palette analysis (https://github.com/MickTheMechanic/FLIR-style-thermal-color-palettes) - thermal color stop reference values
- deck.gl GitHub issue #5781 - colorDomain behavior with SUM aggregation

### Tertiary (LOW confidence)
- Specific P90 interaction with deck.gl SUM aggregation normalization needs empirical testing - the "weight per square meter" interpretation may require a scaling factor adjustment

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing deck.gl/zustand patterns
- Architecture: HIGH - extends existing patterns directly; grid aggregation, detail panel, and layer hooks are well-established
- Color palette: MEDIUM - FLIR Ironbow reference confirmed, but exact 8-stop values need visual tuning
- P90 normalization: MEDIUM - deck.gl `colorDomain` behavior confirmed in docs, but SUM aggregation interaction may need empirical tuning
- Clustering algorithm: HIGH - BFS on regular grid is textbook; max ~2000 cells at 0.25-degree resolution is trivially small
- Pitfalls: HIGH - floating-point grid keys and cluster/entity selection conflict are well-understood issues

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (30 days - stable domain, deck.gl 9.x is mature)
