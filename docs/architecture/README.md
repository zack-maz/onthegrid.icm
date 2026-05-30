# Architecture Documentation

This directory contains the deep-dive architecture reference for the Iran Conflict
Monitor. Start with the project [README](../../README.md) for a quick-start and
hero tour; come here when you want to understand how the system is wired.

Every diagram is [Mermaid](https://mermaid.js.org/) inline — GitHub renders it
natively, no build step, no binary assets. Clone the repo and everything still
works offline.

## System-level diagrams

- [`system-context.md`](./system-context.md) — High-level topology. Browser →
  Vercel edge → Express API → Upstash Redis + 9 upstream data sources.
- [`data-flows.md`](./data-flows.md) — One sequence diagram per data source,
  showing the request path, cache behavior, and upstream quirks.
- [`frontend.md`](./frontend.md) — React component layout, Zustand store
  dependency graph, polling hook ownership, deck.gl layer stacking order.
- [`deployment.md`](./deployment.md) — Vercel functions, cron jobs, CDN cache
  headers, build pipeline, environment variables, failover posture.

## Operator deep-dives

- [`llm-pipeline-reliability.md`](./llm-pipeline-reliability.md) — Measured
  throttle behavior + tuned defaults for the NIM cascade on Vercel Pro 800s.
  Authoritative for the runtime cascade state (NIM-only as of Phase 34;
  OpenRouter dormant per Phase 30.1; Cerebras + Groq deferred per Phase 34).
  Authored Phase 30; appended Phase 30.1 + Phase 31 + Phase 34 sub-blocks.
- [`redis-keys.md`](./redis-keys.md) — 32-key inventory with writers,
  readers, TTLs, cardinality, and load-bearing/observability/retire
  classification. Pinned by `src/__tests__/lib/redis-registry.test.ts` —
  drift fails the next `vitest run`. Authored Phase 35.

## Ontology deep dive

The [`ontology/`](./ontology/) subdirectory is for reviewers who want to see
how the abstractions fit together. The user explicitly asked for "every single
aspect of ontology" so this goes further than a typical project would:

- [`ontology/types.md`](./ontology/types.md) — `MapEntity` discriminated
  union, `SiteEntity`, `WaterFacility`, `ConflictEventType`, `NewsCluster`,
  `CacheResponse<T>`, connection states, error envelope.
- [`ontology/algorithms.md`](./ontology/algorithms.md) — Rationale for the
  hot-path algorithms: threat clustering, GDELT dispersion, severity scoring,
  news clustering & matching, basin lookup, composite water health, time
  grouping.
- [`ontology/state-machines.md`](./ontology/state-machines.md) — Mermaid
  `stateDiagram-v2` blocks for connection lifecycle, polling lifecycle,
  detail-panel navigation stack, and cache freshness.
- [`ontology/complexity.md`](./ontology/complexity.md) — Runtime and space
  complexity table for every hot path, plus the reasoning for why we don't
  paginate.

## As-built honesty

These diagrams reflect what ships **today**, not a polished idealization.
Where known limitations exist they're labeled inline. Phase 27 resolved
the GDELT geolocation issues that were previously tracked as `TODO(26.2)`
markers by adding an LLM enrichment pipeline with Nominatim geocoding.
Remaining limitations (e.g., basin lookup coarseness) are documented as
"Known limitation" notes. Reviewers spotting undisclosed warts is worse
than disclosed warts; honesty is a portfolio signal.

## Authoritative sources

When docs and code disagree, the code wins. Useful entry points:

- API contract: [`server/openapi.yaml`](../../server/openapi.yaml)
- Route wiring: [`server/index.ts`](../../server/index.ts)
- Config schema: [`server/config.ts`](../../server/config.ts)
- Cache layer: [`server/cache/redis.ts`](../../server/cache/redis.ts)
- Shared types: [`server/types.ts`](../../server/types.ts)

Back to the [project README](../../README.md).
