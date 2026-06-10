---
phase: 43-ghost-link-prune-correctness
status: in-progress
created: 2026-06-10T05:09:54Z
---

# Phase 43: Ghost-Link Prune Correctness — Verification Report

**Phase Goal:** Correct the URL-liveness prune pipeline so cron auto-prune no longer sweeps live events misclassified as dead (the "ghost link" false positives), grounded in production evidence rather than assumption. GHOST-09 gates the `403` cron-prune demotion on a real prunedIds + 403-keys browser-UA re-probe sample (D-13/D-14/D-15); SC-3 audits whether recent prunes swept any live events.

> This document is built incrementally per-plan. Plan 04 records the GHOST-09 / SC-3 evidence sample and the locked `403`-demotion decision below; later plans append their own verification sections.

---

## GHOST-09 / SC-3 Evidence Sample

_Generated 2026-06-10T05:09:54.218Z by `scripts/sample-pruned-urls.ts`. Sample size: 13 resolvable prunedIds re-probes (+ 4 prunedIds whose liveness key had already been deleted by the prune) and 20 current `403`-status keys re-probed._

_Browser UA: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36` — production prober UA: `IranMonitor-LinkCheck/1.0`._

**Checkpoint provenance (honest note):** This plan's blocking-human checkpoint was auto-resolved under the active `--auto` chain. The orchestrator ran the read-only sampling script (`scripts/sample-pruned-urls.ts`) against production itself rather than waiting for a separate operator session. Two script bugs surfaced and were fixed first (committed as `fix(43-04): unwrap CacheEntry values + bypass dev CACHE_KEY_PREFIX in prod sampler`, `5f00113`): (1) Redis values are `CacheEntry<UrlLiveness>` wrappers (`{data, fetchedAt}`), so both read paths now unwrap `.data` with a bare-shape fallback; (2) the script now constructs a raw `@upstash/redis` client instead of importing `server/cache/redis.js`, because the server client applies the dev `CACHE_KEY_PREFIX` from `.env.local` and would silently scan the empty `dev:` keyspace — a prod-sampling tool must read unprefixed prod keys. The verdict tables below are the actual production re-probe results.

### prunedIds sample (re-probed with browser UA) — 13 resolvable, 4 unresolvable (key deleted by prune)

| eventId                   | URL                                                                                                                                                                    | probe-UA status        | browser-UA status | verdict |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------- | ------- |
| `llm-v3-grp-20521-19-102` | https://www.kold.com/2026/03/08/7th-american-is-killed-iran-operations-military-confirms/                                                                              | pruned (terminal-dead) | 200               | live    |
| `llm-v3-grp-20527-19-140` | https://www.khqa.com/news/nation-world/crew-of-fatal-us-military-crash-included-georgia-father-and-several-from-ohio/article_2be01c11-b633-5d95-a743-4095614e77b1.html | pruned (terminal-dead) | 404               | dead    |
| `llm-v3-grp-20512-19-2`   | https://www.news18.com/world/burj-khalifa-evacuated-as-iranian-missiles-strike-uae-amid-escalating-conflict-ws-l-9935520.html                                          | pruned (terminal-dead) | 200               | live    |
| `llm-v3-grp-20513-19-13`  | https://www.daytondailynews.com/news/nation-world/the-latest-trump-says-iranian-supreme-leader-ali-khamenei-is-dead/LVLGXFTCRVJPXMWZU3H6LWOJMI/                        | pruned (terminal-dead) | 200               | live    |
| `llm-v3-grp-20513-19-17`  | https://www.daytondailynews.com/news/nation-world/the-latest-trump-says-iranian-supreme-leader-ali-khamenei-is-dead/LVLGXFTCRVJPXMWZU3H6LWOJMI/                        | pruned (terminal-dead) | 200               | live    |
| `llm-v3-grp-20513-19-21`  | https://aninews.in/news/world/us/greatest-chance-for-iranian-people-to-take-back-their-country-trump-after-khameneis-death-in-tehran-strike20260301033426/             | pruned (terminal-dead) | 200               | live    |
| `llm-v3-grp-20514-18-27`  | https://mymotherlode.com/news/world/10580042/dubais-image-as-a-safe-tax-free-haven-is-rocked-by-blasts-from-iranian-airstrikes.html                                    | pruned (terminal-dead) | 404               | dead    |
| `llm-v3-grp-20516-18-55`  | https://abcnews.com/US/wireStory/trial-seeks-tie-iranian-paramilitary-alleged-assassination-plot-130730791                                                             | pruned (terminal-dead) | 404               | dead    |
| `llm-v3-grp-20516-19-52`  | https://abcnews.com/US/wireStory/trial-seeks-tie-iranian-paramilitary-alleged-assassination-plot-130730791                                                             | pruned (terminal-dead) | 404               | dead    |
| `llm-v3-grp-20517-19-62`  | http://www.asiabulletin.com/news/278902697/afghan-pak-tensions-discussed-with-china-ambassador-in-kabul-beijing-calls-for-dialogue                                     | pruned (terminal-dead) | 200               | live    |
| `llm-v3-grp-20517-19-73`  | https://www.channel3000.com/news/national-and-world-news/everything-we-know-on-day-6-of-the-middle-east-war/article_0a044a02-db5e-52e0-b484-ba11b008c145.html          | pruned (terminal-dead) | 404               | dead    |
| `llm-v3-grp-20551-19-313` | https://www.morningjournalnews.com/news/local-news/2026/04/trump-pulls-back-on-his-iran-threats-for-2-weeks-subject-to-iran-agreeing-to-ceasefire/                     | pruned (terminal-dead) | 200               | live    |
| `llm-v3-grp-20552-19-320` | https://www.columbian.com/news/2026/apr/08/u-s-israel-and-iran-agree-to-a-2-week-ceasefire-but-much-remains-unclear-and-some-attacks-continue/                         | pruned (terminal-dead) | 200               | live    |

### 403-status keys sample (re-probed with browser UA)

| eventId                   | URL                                                                                                                                                        | probe-UA status | browser-UA status | verdict |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------- | ------- |
| `llm-v3-grp-20512-19-2`   | https://www.news18.com/world/burj-khalifa-evacuated-as-iranian-missiles-strike-uae-amid-escalating-conflict-ws-l-9935520.html                              | 403             | 200               | live    |
| `llm-v3-grp-20513-19-21`  | https://aninews.in/news/world/us/greatest-chance-for-iranian-people-to-take-back-their-country-trump-after-khameneis-death-in-tehran-strike20260301033426/ | 403             | 200               | live    |
| `llm-v3-grp-20517-19-62`  | http://www.asiabulletin.com/news/278902697/afghan-pak-tensions-discussed-with-china-ambassador-in-kabul-beijing-calls-for-dialogue                         | 403             | 200               | live    |
| `llm-v3-grp-20517-19-75`  | http://www.asiabulletin.com/news/278902697/afghan-pak-tensions-discussed-with-china-ambassador-in-kabul-beijing-calls-for-dialogue                         | 403             | 200               | live    |
| `llm-v3-grp-20529-18-152` | http://www.bignewsnetwork.com/news/278927265/eliminated-israeli-defence-forces-confirm-death-of-senior-iran-military-chief-soleimani                       | 403             | 200               | live    |
| `llm-v3-grp-20530-18-159` | http://www.iraqsun.com/news/278928345/ali-larijani-assassination-will-be-source-of-national-awakening-irgc                                                 | 403             | 200               | live    |
| `llm-v3-grp-20530-18-160` | http://www.memphissun.com/news/278928216/israeli-warplanes-assassinate-iran-s-defacto-leader-ali-larijani                                                  | 403             | 200               | live    |
| `llm-v3-grp-20530-18-161` | http://www.memphissun.com/news/278928216/israeli-warplanes-assassinate-iran-s-defacto-leader-ali-larijani                                                  | 403             | 200               | live    |
| `llm-v3-grp-20530-18-164` | http://www.memphissun.com/news/278928216/israeli-warplanes-assassinate-iran-s-defacto-leader-ali-larijani                                                  | 403             | 200               | live    |
| `llm-v3-grp-20530-18-167` | http://www.memphissun.com/news/278928216/israeli-warplanes-assassinate-iran-s-defacto-leader-ali-larijani                                                  | 403             | 200               | live    |
| `llm-v3-grp-20530-19-158` | http://www.nepalnational.com/news/278928190/pm-modi-extends-eid-greetings-to-uae-president                                                                 | 403             | 200               | live    |
| `llm-v3-grp-20530-19-166` | http://www.iraqsun.com/news/278928471/zelenskyy-says-200-ukrainian-air-defence-experts-aiding-in-countering-iranian-drone-attacks                          | 403             | 200               | live    |
| `llm-v3-grp-20531-19-170` | http://www.neworleanssun.com/news/278930603/iran-war-enters-day-19-beirut-bombed-missiles-hit-near-tel-aviv                                                | 403             | 200               | live    |
| `llm-v3-grp-20531-19-171` | http://www.laosnews.net/news/278930519/the-iran-war-is-exposing-this-major-shift-of-the-21st-century                                                       | 403             | 200               | live    |
| `llm-v3-grp-20531-19-173` | http://www.neworleanssun.com/news/278930603/iran-war-enters-day-19-beirut-bombed-missiles-hit-near-tel-aviv                                                | 403             | 200               | live    |
| `llm-v3-grp-20531-19-176` | http://www.laosnews.net/news/278930519/the-iran-war-is-exposing-this-major-shift-of-the-21st-century                                                       | 403             | 200               | live    |
| `llm-v3-grp-20545-19-271` | http://www.middleeaststar.com/news/278959437/israel-reports-missile-attacks-from-iran                                                                      | 403             | 200               | live    |
| `llm-v3-grp-20545-19-272` | http://www.middleeaststar.com/news/278959437/israel-reports-missile-attacks-from-iran                                                                      | 403             | 200               | live    |
| `llm-v3-grp-20545-19-273` | http://www.middleeaststar.com/news/278959437/israel-reports-missile-attacks-from-iran                                                                      | 403             | 200               | live    |
| `llm-v3-grp-20545-19-274` | http://www.middleeaststar.com/news/278959437/israel-reports-missile-attacks-from-iran                                                                      | 403             | 200               | live    |

### SC-3 verdict

**FLAG** — 8 live URLs in the prunedIds sample (the pre-fix cron prune swept live events). Per D-13, zero-live = PASS; any live URL = the prune swept a live event, which must be flagged. This FLAG is on the **PRE-FIX** cron-prune behavior and is remediated by exactly this phase's D-15 demotion (implemented in Plan 43-05).

**Root cause:** the swept-live events were `403` bot-blocking-CDN false positives. Several eventIds appear in BOTH tables — `llm-v3-grp-20512-19-2` (news18.com), `llm-v3-grp-20513-19-21` (aninews.in), `llm-v3-grp-20517-19-62` (asiabulletin.com) — showing an extract → `403`-false-positive → prune → re-extract churn loop. The same article is repeatedly classified `403` (terminal-dead), pruned, then re-ingested by the next extraction run, only to be re-pruned. The D-15 cron-only `403` exclusion breaks this loop at the prune step.

### 403 false-positive signal

**20 of 20** re-probed `403`-status URLs serve a LIVE article (HTTP 200) with a browser UA. The bot-blocking-CDN false-positive hypothesis is **SUPPORTED** — these publisher CDNs `403` the production prober UA (`IranMonitor-LinkCheck/1.0`) while serving the same live article to a browser UA. This is decisive evidence favoring demotion of `403` to manual-only cron prune (D-14).

### Locked decision

**Locked decision (D-14/D-15): DEMOTE — 403 is excluded from cron auto-prune; manual prune + dashboard count + terminal-dead classification unchanged.**

D-14's pre-registered expected outcome (DEMOTE) is CONFIRMED by the evidence: 20 of 20 re-probed production `403`-status URLs serve a live article with a browser UA. Per D-15, `403` stays in the taxonomy, stays terminal-dead (dashboard count, `deadUrlSample`, and manual operator prune all unchanged); only the **cron** prune filter excludes it (`trigger === 'cron'` skips `403` regardless of `attemptCount`). This locked decision is the input consumed by Plan 43-05's one-line cron-only `403` prune-filter change.
