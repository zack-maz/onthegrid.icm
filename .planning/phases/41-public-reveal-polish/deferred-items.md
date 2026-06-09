# Phase 41 — Deferred Items

Out-of-scope discoveries logged during execution (SCOPE BOUNDARY rule). Not fixed.

## docs:lint pre-existing dead links in `docs/**` (discovered Plan 04, Task 3)

`npm run docs:lint` surfaces dead links in several `docs/**` files. These are
**pre-existing** (present at the phase-start commit `4146679`), **unrelated to
the screenshot consolidation** (none reference the moved `public/screenshots/`
assets), and were previously **masked** by the `localhost` README links
short-circuiting the `&&` chain before the `docs/**` lint ran.

Plan 04 fixed the in-scope part (README + SHOWCASE screenshot refs resolve;
`markdown-link-check README.md` passes clean) and added
`.markdown-link-check.json` ignoring `localhost` so the README gate is
deterministic. The `docs/**` failures below are left for a dedicated docs-link
cleanup pass:

- `docs/adr/0002-vercel-serverless-over-traditional-hosting.md` — relative
  links `../../server/vercel.ts`, `../../server/app.ts` (Status 400 — markdown-
  link-check resolves `.ts` source links as HTTP, not filesystem).
- `docs/adr/0005-phase-26-2-nlp-approach-scrapped.md` — `../../.planning/...`
  CONTEXT.md links.
- `docs/runbook.md` — in-page anchors `#13-nim-throttle-handling`,
  `#14-cron-architecture-lessons`, `#15-force-trigger-runbook` (Status 404).
- `docs/architecture/ontology/algorithms.md` — `../../../server/lib/dispersion.ts`.
- `docs/architecture/llm-pipeline-reliability.md` — `../../.planning/phases/31-.../31-SUMMARY.md`.
- (plus other `.tsx`/`.ts` relative-source links flagged Status 400.)

Root cause: `markdown-link-check` treats relative paths to source files as HTTP
links rather than filesystem references, and `.planning/` is not always present
in deploy contexts. A future pass should either add filesystem-aware
`replacementPatterns` to `.markdown-link-check.json` or scope `docs:lint` to
external (http) links only.
