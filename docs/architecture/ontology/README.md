# Ontology Deep Dive

Four focused files covering the type system, the algorithms, the state
machines, and the runtime characteristics of the system. Written for
reviewers who want to see every seam.

- [`types.md`](./types.md) — every discriminated union, entity type,
  cache envelope, and error shape, with source pointers.
- [`algorithms.md`](./algorithms.md) — hot-path algorithms with
  rationale per design decision.
- [`state-machines.md`](./state-machines.md) — connection lifecycle,
  polling lifecycle, detail-panel navigation stack, cache freshness.
- [`complexity.md`](./complexity.md) — runtime and space complexity
  table for every hot-path operation plus frame-budget reasoning.

Back to [`docs/architecture/`](../README.md).
