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
Where tech debt exists it's labeled inline, typically with a `TODO(26.2)`
annotation pointing at the GDELT geolocation redo phase. Reviewers spotting
undisclosed warts is worse than disclosed warts; honesty is a portfolio signal.

## Authoritative sources

When docs and code disagree, the code wins. Useful entry points:

- API contract: [`server/openapi.yaml`](../../server/openapi.yaml)
- Route wiring: [`server/index.ts`](../../server/index.ts)
- Config schema: [`server/config.ts`](../../server/config.ts)
- Cache layer: [`server/cache/redis.ts`](../../server/cache/redis.ts)
- Shared types: [`server/types.ts`](../../server/types.ts)

Back to the [project README](../../README.md).
