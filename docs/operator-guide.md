# Operator Guide — Visitor How-To

> **This is the visitor how-to**, not the incident-response runbook. If you've
> cloned the repo and want to run it, poke the operator surfaces, regenerate the
> hero GIF, or just understand what the operator buttons do, you're in the right
> place.
>
> For real failure modes and recovery procedures (Redis unreachable, GDELT 404,
> NIM throttle, cron failure, the degrade-open contracts), see the
> [Operations Runbook](./runbook.md) instead — that's the incident-response
> counterpart and a deliberately distinct surface.
>
> Part of the [Showcase](./SHOWCASE.md) "go deeper" set.

---

## 0. Before you start

A few ground rules that apply to every section below:

- **Never embed a real Bearer / `DASHBOARD_PASSWORD` in a command you share.**
  The operator endpoints are Bearer-gated; the examples use the placeholder
  `<your-bearer>`. Substitute your own and keep it out of history.
- The operator endpoints (`force=true` cron, prune, replay) all sit behind
  `DASHBOARD_PASSWORD`. An empty password fails closed on those routes.
- All commands below assume you're at the repo root.

---

## 1. Clone and run locally

```bash
git clone https://github.com/zack-maz/otg-iran-monitor.git
cd otg-iran-monitor
npm install
cp .env.example .env        # then fill in the keys you want
npm run dev                 # client (Vite) + server (tsx) together
```

The dev server runs the Vite client and the Express API side by side
(`concurrently`). Most data feeds need **no key at all** — GDELT, adsb.lol,
Open-Meteo, Overpass, and Nominatim are all free and unauthenticated, so you get
a working map immediately. Add keys to `.env` only for the feeds you want to
light up (Upstash Redis for caching, NIM for LLM enrichment, OpenSky / AISStream /
RapidAPI for richer flight + ship data). Every variable is documented inline in
[`.env.example`](../.env.example).

> Node is pinned to `22.x` (see `package.json` `engines`). Use a matching version.

---

## 2. Force-trigger the events cron

The LLM event-extraction pipeline is **cron-only** — the daily 4am UTC
`/api/cron/refresh-events` job is the sole writer of `events:llm:v3`. To run it
on demand (e.g. after a code change, or to warm a cold cache without waiting):

```bash
curl -H "Authorization: Bearer <your-bearer>" \
  "https://otg-iran-monitor.vercel.app/api/cron/refresh-events?force=true"
```

`?force=true` bypasses the 15-minute cooldown sentinel. A cold cache
(`events:llm:v3` empty) self-heals on the next tick without `force`, but
`force=true` is how you trigger it right now. Locally, point the same request at
`http://localhost:3000` instead.

> If the run hangs or `/api/events` starts returning 500, that's an incident, not
> a how-to — see [runbook §10](./runbook.md) for the recovery procedure.

---

## 3. Prune dead-URL (ghost) events

Conflict events whose source URL has gone dead (404 / 403 / dead-host) are
"ghost events". The dashboard surfaces a dead-URL count, and you can prune them:

```bash
curl -X POST \
  -H "Authorization: Bearer <your-bearer>" \
  "https://otg-iran-monitor.vercel.app/api/events/prune-dead-urls"
```

The endpoint is Bearer-gated and per-Bearer rate-limited (50 prunes / 24h →
`429` with `Retry-After` at the cap; `503` if Redis is unreachable, per the
degrade-open contract). The OpenAPI operation for this path is in
[`server/openapi.yaml`](../server/openapi.yaml). Background on the liveness
probe and the `O(1)` sidecar counter is in
[concepts.md → ghost event](./concepts.md#ghost-event).

---

## 4. Read the `/api/operator-status` payload

The operator aggregator is a single Bearer-gated endpoint that rolls up the live
operator surfaces — URL-liveness counts, operator audit log, prune/replay quota
state, and more:

```bash
curl -H "Authorization: Bearer <your-bearer>" \
  "https://otg-iran-monitor.vercel.app/api/operator-status" | jq
```

It **degrades open** — under Redis death it returns `200` (degraded) or `503`,
never `500`. This is the payload the dashboard's API Health tab renders. The
related LLM Flight Recorder data (per-call and per-run history) lives at the
Bearer-gated `GET /api/events/llm-history`
([`server/openapi.yaml`](../server/openapi.yaml));
see [concepts.md → flight recorder](./concepts.md#flight-recorder).

---

## 5. Run the eval harness

The resolver eval scores location accuracy against 50 curated ground-truth events
across 11 countries, at 5 / 20 / 100 km tolerances. Run the replay locally:

```bash
npm run eval:replay
```

It's resolver-only (no LLM calls) to avoid doubling token spend, so it's cheap to
run repeatedly. Companion scripts: `npm run eval:detail` for a per-event
breakdown, and `npm run analyze:llm-run` to inspect a recorded run. Background in
[concepts.md → eval harness](./concepts.md#eval-harness).

---

## 6. Capture a fresh hero GIF

The portfolio hero GIF is regenerated programmatically — no manual screen
recording:

```bash
npm run capture:hero
```

This drives the map through a scripted sequence with Playwright (flying to
locations and toggling named layers via the dev-only `window.__map` exposer) and
stitches the frames into `public/screenshots/hero.gif` with gifski. It takes
~45s and survives UI changes because it re-captures from the live app rather than
freezing a one-off recording. See
[concepts.md → capture:layers](./concepts.md#capturelayers) for the layer
contract it relies on.

---

## How this differs from the runbook

| This guide (operator-guide.md)             | The [runbook](./runbook.md)                              |
| ------------------------------------------ | -------------------------------------------------------- |
| Visitor how-to — run it, poke it, learn it | Incident response — recover it when it breaks            |
| Clone & run, force cron, prune, eval, GIF  | Redis unreachable, GDELT 404, NIM throttle, cron failure |
| "Here's how to use the operator surfaces"  | "Here's the playbook when a surface is on fire"          |

If you came to **operate** the live system under failure — NIM throttle handling,
the degrade-open recovery procedures, the cron-architecture playbooks — the
[runbook](./runbook.md) is the canonical operator-surface reference. This guide
stops at the happy-path how-to.

---

_Back to the [Showcase](./SHOWCASE.md) · repo front door is the
[README](../README.md)._
