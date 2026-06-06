# Costs — What This Actually Runs On

> The honest accounting. Iran Monitor fuses ten live data feeds into a real-time
> 2.5D conflict dashboard, and the **only** recurring line item in the entire
> stack is Vercel Pro at **$20/month**. Everything upstream is free-tier. This
> page is the "you can do this too" breakdown — if you're a developer weighing
> whether a project like this is affordable to run, the answer is: yes, for the
> price of one Vercel plan.
>
> Part of the [Showcase](./SHOWCASE.md) "go deeper" set.

---

## Table 1 — Infrastructure & data feeds

| Line item                  | Tier            | Cost         | Why                                                                                                                        |
| -------------------------- | --------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Vercel Pro**             | Pro             | **$20 / mo** | The only paid line. Required for `functions.maxDuration: 800` — the ~10-min LLM extraction cron exceeds the Hobby ceiling. |
| Vercel hosting / CDN / DNS | (in Pro)        | $0           | SPA + serverless functions + edge gzip/brotli all included in Pro.                                                         |
| Custom domain              | none            | $0           | Stays on `otg-iran-monitor.vercel.app` (see [D-09 rationale](#d-09--why-no-custom-domain) below).                          |
| NVIDIA NIM (qwen-235b)     | free            | $0           | Sole runtime LLM provider for event enrichment. NIM-only at runtime; OpenRouter dormant.                                   |
| Upstash Redis              | free            | $0           | REST-based serverless cache (~32 keys). Polite-citizen rate limiting keeps the command budget inside the free tier.        |
| GDELT v2                   | free, no auth   | $0           | Default conflict-event source (15-min updates).                                                                            |
| OpenSky Network            | free            | $0           | Flight ADS-B source (5s poll).                                                                                             |
| adsb.lol                   | free, no auth   | $0           | Default free flight source (30s poll).                                                                                     |
| Open-Meteo                 | free, no auth   | $0           | 30-day precipitation anomaly for water-stress scoring.                                                                     |
| Yahoo Finance              | free            | $0           | Commodity / oil price feed.                                                                                                |
| AISStream                  | free            | $0           | Ship AIS positions (on-demand WebSocket, no persistent connection).                                                        |
| Overpass (OpenStreetMap)   | free            | $0           | Static infrastructure + water facilities (24h cache).                                                                      |
| WRI Aqueduct 4.0           | free dataset    | $0           | Baseline water-stress basins.                                                                                              |
| Natural Earth              | public domain   | $0           | Political boundaries / disputed areas.                                                                                     |
| GeoEPR (ETH Zurich)        | free academic   | $0           | Ethnic-distribution boundaries.                                                                                            |
| Nominatim (OSM)            | free, throttled | $0           | Forward/reverse geocode (1 req/s polite-citizen throttle).                                                                 |

**Total recurring infra cost: $20 / month.** Every data feed is free, most with
no auth at all. The architecture choices that keep it that way — REST-based
Upstash, on-demand AISStream, the 1-req/s Nominatim throttle, and per-endpoint
rate limiters — are the same ones documented in
[concepts.md → polite-citizen contracts](./concepts.md#polite-citizen-contracts).

> ADS-B Exchange via RapidAPI is wired as an optional higher-fidelity flight
> source, but the live deployment runs on the free adsb.lol + OpenSky tiers, so
> it adds $0 unless you opt in.

---

## Table 2 — Development cost (agentic build)

This project was built almost entirely through an agentic `/gsd` workflow with
Claude Code. There is no per-seat infra cost to report — the "cost" is the
development effort, which the retrospectives record honestly. Figures below are
cited from [`.planning/RETROSPECTIVE.md`](../.planning/RETROSPECTIVE.md) Cost
Observations; nothing here is invented.

| Milestone | Commits | Wall-clock | Notes                                                                                                                                        | Source                                                                    |
| --------- | ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| v0.9      | 229     | 6 days     | ~2 hours total plan execution time; stable ~4–5 min per plan throughout.                                                                     | [RETROSPECTIVE.md:54](../.planning/RETROSPECTIVE.md) (Cost Observations)  |
| v1.5      | 209     | 24 days    | 10 phases / 60 plans executed of 62 declared (97% execution rate; 2 conditional SKIPs + 4 deferral SKIPs); ~3 days/phase for closing phases. | [RETROSPECTIVE.md:254](../.planning/RETROSPECTIVE.md) (Cost Observations) |

The headline development-cost lesson, also from the v1.5 retrospective: the
**honest path was the cheaper path**. The Phase 34 `cerebras-groq-deferred`
deferral and the Phase 31 early-close kept the milestone moving without false
reliability claims — see [honest deferral](./concepts.md#honest-deferral).

---

## D-09 — Why no custom domain

The deliberate decision (REVEAL-SITE-04, recorded here per Phase 41 D-09) is to
stay on the clean `otg-iran-monitor.vercel.app` origin rather than buy a custom
domain:

- **$0 domain registration** — no annual registrar fee.
- **$0 DNS** — no nameserver setup, no DNS-propagation debugging, no
  certificate-renewal surface.
- The `vercel.app` subdomain is already clean, memorable, and HTTPS-terminated by
  Vercel. For a personal portfolio dashboard, a custom domain would add cost and
  operational surface for zero functional gain.

This keeps the total cost of the live demo at exactly the $20/month Vercel Pro
line — no hidden domain or DNS line items.

---

## The bottom line

You can run this. One Vercel Pro plan, a handful of free API keys (most feeds
need none), and an Upstash free-tier Redis. The whole live-intelligence pipeline
— ten feeds, LLM enrichment, a 2.5D map — costs **$20/month**, and the
architecture is built specifically to stay inside every free tier it touches.

---

_Back to the [Showcase](./SHOWCASE.md) · repo front door is the
[README](../README.md). For the build meta-story, see
[BUILDING-WITH-CLAUDE-CODE.md](./BUILDING-WITH-CLAUDE-CODE.md)._
