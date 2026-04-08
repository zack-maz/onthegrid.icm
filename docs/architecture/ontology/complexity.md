# Runtime and Space Complexity

This document is the answer to "what are the runtime characteristics
of the hot paths" in one page. It exists so a reviewer can quickly
sanity-check that the system is sized for its workload without
reverse-engineering the code.

## Hot-path operations

Typical values at the time of writing:

- `n_flights` ≤ ~200 (ADS-B return from `IRAN_BBOX`)
- `n_ships` ≤ ~150 (AIS PositionReports per 5-second collect)
- `n_events` ≤ ~2000 (GDELT window after WAR_START + filters)
- `n_news` ≤ ~500 articles per 15-minute poll
- `n_sites` ≤ ~120 (Overpass query result, cached 24h)
- `n_water` ≤ ~4300 named facilities (Overpass + basin lookup)
- `k_active_filters` ≤ ~15 (filterStore + searchStore AST combined)
- `q_query_ast` ≤ ~10 tag nodes (search modal max)

| Operation                     | File                                                 | Time                                                   | Space        | Notes                                                                               |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------- |
| Flight render                 | `src/hooks/useEntityLayers.ts`                       | O(n_flights)                                           | O(n_flights) | Filter + icon resolve per poll, then handed to deck.gl.                             |
| Ship render                   | `src/hooks/useEntityLayers.ts`                       | O(n_ships)                                             | O(n_ships)   | Same path as flights.                                                               |
| Event dispersion (server)     | `server/lib/dispersion.ts`                           | O(n_events × c_centroids)                              | O(n_events)  | `c_centroids` ≈ 100 city entries. Nearest-neighbor scan per event.                  |
| Threat clustering             | `src/components/map/layers/ThreatHeatmapOverlay.tsx` | O(n_events + c_cells)                                  | O(c_cells)   | Grid binning is O(n_events); BFS over cells is O(c_cells) where c_cells ≤ n_events. |
| News dedup + clustering       | `server/lib/newsClustering.ts`                       | O(n_news²) worst case                                  | O(n_news·t)  | Jaccard pairs; fuzzy match gated by 5-token minimum. t = avg token count per title. |
| News matching per event       | `src/lib/newsMatching.ts`                            | O(n_news) per event                                    | O(3)         | Linear scan + score, top-3 selection; called by `useNotifications`.                 |
| Notification derivation       | `src/hooks/useNotifications.ts`                      | O(n_events × n_news)                                   | O(n_events)  | Runs on eventStore or newsStore change. Memoized by store refs.                     |
| Filter evaluation             | `src/hooks/useFilteredEntities.ts`                   | O((n_flights + n_ships + n_events) × k_active_filters) | O(n_kept)    | One pass per render; most filters are field comparisons.                            |
| Search AST evaluation         | `src/hooks/useSearchResults.ts`                      | O((n_flights + n_ships + n_events) × q_query_ast)      | O(matches)   | Evaluates parsed tag AST against each entity; short-circuits on implicit OR.        |
| Basin lookup                  | `server/lib/basinLookup.ts`                          | O(c_countries) per facility                            | O(1)         | 29 country centroids. One haversine + one median pick.                              |
| Water composite health        | `src/lib/waterStress.ts`                             | O(1) per facility                                      | O(1)         | Three arithmetic ops + clamp.                                                       |
| Severity score                | `src/lib/severity.ts`                                | O(1) per event                                         | O(1)         | Four multiplications + two `log2`.                                                  |
| Attack status cross-reference | `src/lib/attackStatus.ts`                            | O(n_sites × n_events_in_window)                        | O(n_sites)   | Called once per render; events are pre-filtered to last 24h.                        |
| Polling fetch                 | `src/hooks/use*Polling.ts`                           | O(network)                                             | O(payload)   | Single `fetch`; cancelled via closure flag on unmount.                              |
| Cache get (Redis)             | `server/cache/redis.ts#cacheGetSafe`                 | O(1) network + 2000ms max                              | O(entry)     | Bounded by `REDIS_OP_TIMEOUT_MS` via `Promise.race`.                                |
| Cache set (Redis)             | `server/cache/redis.ts#cacheSetSafe`                 | O(1) network + 2000ms max                              | O(entry)     | Same timeout envelope. Writes mem cache unconditionally.                            |

## Pagination / load reasoning

**We don't paginate**, for any API or client list, because:

1. **Typical entity counts are O(100s to low 1000s).** Flights max at
   ~200, events at ~2000, water facilities at ~4300. None of these
   are big enough to justify the UX cost of pagination.
2. **deck.gl can render tens of thousands of points at 60fps** on
   modest hardware. We're one order of magnitude below the
   GPU-bound threshold on every layer.
3. **The bottleneck is upstream API quotas, not local computation.**
   OpenSky, GDELT, Overpass, and Open-Meteo all have rate limits
   much tighter than our render budget. Caching (logical + hard TTL,
   stale-while-revalidate, CDN in front) exists to protect those
   quotas, not to compress payloads below some magic threshold.
4. **Filters and search narrow visible results.** The user's current
   toggle + filter + search state always subsets the full arrays
   at render time, so the "visible N" is usually far smaller than
   the "cached N."

The one place we do lazily batch is the **Open-Meteo precipitation
fetch**, which exceeds the per-request location limit (100). We split
into concurrent batches of 100 on the server. That's batching, not
pagination — the client still gets the whole result.

## Frame budget

The 2.5D map targets **60fps = ~16.6ms per frame** on typical laptop
hardware. Here's where the time goes when nothing is broken:

- **deck.gl layer updates:** ~1-3 ms. The heavy lifting is on the
  GPU (vertex shader + RadialGradientExtension fragment shader for
  threat clusters).
- **MapLibre terrain + raster tiles:** ~2-4 ms. This is essentially
  fixed cost as long as terrain is on.
- **React re-render triggered by a store change:** ~1-2 ms if the
  change is shallow (a `selectEntity` call that only re-renders the
  detail panel). Larger changes (entity poll results) can be
  ~5-10 ms if `useFilteredEntities` has to re-run.
- **Map pan/zoom animation:** native MapLibre, doesn't touch React
  until a store update is needed.

Comfortable headroom at typical loads. Pathological cases (e.g.
selecting a date range that yields ~10k events) can push re-render
cost above the frame budget; this is tracked for Phase 27.

## Re-render triggers

The Zustand store pattern makes re-renders explicit. A component
re-renders when:

- Its selector output changes under shallow equality:
  `useStore(s => s.field)` re-renders only when `s.field` changes,
  not when any other field in the store mutates.
- It's a child of a component that re-rendered (standard React
  behavior).

The bigger data stores (`flightStore`, `eventStore`) typically
mutate on a timer rather than on user input, and each mutation
replaces the whole `flights` / `events` array. This is deliberate:

- Replacing the array is O(1) for Zustand and O(n) for deck.gl to
  re-project.
- Merging by ID would be O(n·m) and introduce ordering
  instability.
- The arrays are small enough (hundreds, not millions) that the
  O(1) replacement is the right choice.

## See also

- [`algorithms.md`](./algorithms.md) — detailed rationale for the
  heavy hitters in the table above.
- [`state-machines.md`](./state-machines.md) — what triggers each
  code path.
- [`../data-flows.md`](../data-flows.md) — the network side of each
  polling operation.
