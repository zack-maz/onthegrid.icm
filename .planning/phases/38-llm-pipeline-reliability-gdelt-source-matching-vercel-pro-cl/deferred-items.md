# Phase 38 — Deferred Items

Out-of-scope discoveries logged during execution (per SCOPE BOUNDARY rule). Not fixed in the originating plan.

## 38-02 (LLM-PURGE)

- **`npm run check:env` exits 1 (pre-existing)** — `scripts/check-env-example.ts` reports 15 `VITE_*` + `LLM_PIPELINE_V2`/`LLM_PIPELINE_V3` keys as "EXTRA in .env.example (not in schema)". These are client-tier (`VITE_*`, exposed via Vite, not parsed by the server `parseEnv()` Zod schema) and the two pipeline rollout flags. Confirmed present at the branch base commit (`af3bbbe`) — NOT introduced by 38-02. The 38-02 Cerebras/Groq env-key removal kept the server schema and `.env.example` consistent (neither `CEREBRAS_API_KEY` nor `GROQ_API_KEY` appears in the drift list). Fix would be either whitelisting client-tier vars in the drift checker or splitting the checker into server/client tiers — out of scope for the LLM-PURGE deletion plan.
