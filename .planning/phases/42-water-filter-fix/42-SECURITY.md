---
phase: 42
slug: water-filter-fix
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-09
---

# Phase 42 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary                                        | Description                                                                                       | Data Crossing                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Overpass API → refresh:water                    | Untrusted public OSM data enters the pipeline via diagnosis runs and snapshot regen               | OSM elements incl. `operator` tags (potential PII/email) |
| refresh:water → committed snapshot              | Regenerated `water-facilities.json` is committed to a public repo                                 | Scrubbed facility records (id, name, type, coords)       |
| Overpass-sourced WaterFacility[] → spatialDedup | Public OSM data flows through the dedup transform; no auth/session boundary crossed               | Facility labels and coordinates                          |
| Source key literals → redis-registry drift gate | A partial cache-key bump leaves the registry inconsistent; the mechanical gate is the trust check | Redis key literals (`water:facilities:v4`)               |

---

## Threat Register

| Threat ID | Category               | Component                                                                                                       | Disposition | Mitigation                                                                                                                                                                                                                                                                                                                                                                                 | Status |
| --------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| T-42-01   | Information Disclosure | OSM `operator` PII/email in refresh:water output reaching 42-DIAGNOSIS.md                                       | mitigate    | `/@[\w.]+/` scrub intact at `scripts/refresh-water-facilities.ts:79` (loop 78-84, unchanged); 42-DIAGNOSIS.md cites only id+name+facilityType+coords with explicit PII note at lines 90-93; grep for `@`-patterns in DIAGNOSIS prose: none                                                                                                                                                 | closed |
| T-42-02   | Tampering              | npm/pip/cargo installs (Plan 01)                                                                                | accept      | No package installs this phase; no `tech-stack.added` in any SUMMARY                                                                                                                                                                                                                                                                                                                       | closed |
| T-42-03   | Tampering              | Loosening the collapse predicate could silently re-drop named facilities (empty normName on a labeled facility) | mitigate    | `normName` reads `f.label` (not `nameLatin`) at `server/adapters/overpass-water.ts:279`; collapse predicate at :319-324 collapses only on `ename === fname \|\| ename === '' \|\| fname === ''`; case-(a) distinct-named fixture (test :2362-2370) and case-(e) `Sd Wdy Rbg`/`Rabigh Dam` regression pin (test :2423-2453) both GREEN (211/211)                                            | closed |
| T-42-04   | Denial of Service      | O(n²) `kept.some(...)` inner scan on the deterministic-sorted set                                               | accept      | Runs only in `refresh:water` + gated `?refresh=true`, never on the user request path; corpus bounded to ME water facilities; performance explicitly not a phase requirement (CONTEXT Claude's Discretion)                                                                                                                                                                                  | closed |
| T-42-05   | Tampering              | npm/pip/cargo installs (Plan 02)                                                                                | accept      | No package installs this phase (RESEARCH §Package Legitimacy Audit: not applicable)                                                                                                                                                                                                                                                                                                        | closed |
| T-42-06   | Information Disclosure | OSM `operator` PII/email reaching the committed `water-facilities.json` snapshot                                | mitigate    | Scrub ran during regen (Plan 03 Task 2); committed `src/data/water-facilities.json` (460 facilities, 15 with `operator`) contains zero `@`-email patterns and zero operator fields matching `/@[\w.]+/`                                                                                                                                                                                    | closed |
| T-42-07   | Tampering              | Partial cache-key bump leaves a live consumer reading the stale v3 key                                          | mitigate    | Canonical writer `server/routes/water.ts:127` = `water:facilities:v4`; drift gate `src/__tests__/lib/redis-registry.test.ts` GREEN with v3 demoted to dead-surveillance whitelist (:72-76) and v4 documented canonical (:80); only remaining v3 references repo-wide are a historical comment (`healthSources.ts:19`) and the surveillance whitelist entry — no live canonical v3 consumer | closed |
| T-42-08   | Tampering              | npm/pip/cargo installs (Plan 03)                                                                                | accept      | No package installs this phase (RESEARCH §Package Legitimacy Audit: not applicable)                                                                                                                                                                                                                                                                                                        | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## Accepted Risks Log

| Risk ID  | Threat Ref                  | Rationale                                                                                                                                                                            | Accepted By                      | Date       |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ---------- |
| AR-42-01 | T-42-02 / T-42-05 / T-42-08 | No package installs occurred in any of the three plans; supply-chain surface unchanged (RESEARCH §Package Legitimacy Audit: not applicable)                                          | operator (plan-time disposition) | 2026-06-09 |
| AR-42-02 | T-42-04                     | O(n²) spatial-dedup scan runs only on the cron/refresh path (`refresh:water`, gated `?refresh=true`), never on the user request path; corpus bounded to Middle East water facilities | operator (plan-time disposition) | 2026-06-09 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By                      |
| ---------- | ------------- | ------ | ---- | --------------------------- |
| 2026-06-09 | 8             | 8      | 0    | gsd-security-auditor (opus) |

Audit notes:

- Register authored at plan time (all 3 PLAN files contained `<threat_model>` blocks); auditor ran in verify-mitigations mode, no new-threat scan.
- Verification run live: `npx vitest run src/__tests__/lib/redis-registry.test.ts server/__tests__/adapters/overpass-water.test.ts` → 2 files / 211 tests passed.
- No `## Threat Flags` in any SUMMARY; `tech-stack.added` empty in all three — no unregistered attack surface.
- The lone Rule-1 auto-fix (`scripts/audit-water-names.ts:214` v3→v4 bump, 42-03-SUMMARY) is a T-42-07 completion (stale-key reader), not new surface; verified v4.
- Audit was read-only; no implementation files modified.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-09
