// @vitest-environment node
/**
 * Phase 36 D-08 — OpenAPI spec drift gate (Redocly lint vitest).
 *
 * Shells out to `npx @redocly/cli lint server/openapi.yaml --format=stylish`
 * and asserts exit code 0. Drift in spec syntax, unresolved $refs, missing
 * required fields, or unknown security-scheme references fails the next
 * `vitest run` instead of accumulating between phase audits.
 *
 * Primary template — `server/__tests__/lib/urlLiveness.schema.test.ts`
 * (Phase 32 D-22): shell-out + exit-code assertion pattern. Mirrors the
 * schema-pinning precedent of `colorBridge.test.ts` (byte-identity sentinel),
 * `actorCatalog.test.ts` (Phase 33 D-07), and `redis-registry.test.ts`
 * (Phase 35 D-01).
 *
 * Default vitest environment is jsdom per `vite.config.ts`; the
 * `@vitest-environment node` directive on line 1 selects node for
 * `child_process.spawnSync` to work without jsdom polyfills.
 *
 * Failure scenarios this gate MUST catch:
 *   - Adding an endpoint with an unresolvable `$ref: '#/components/schemas/Missing'`.
 *   - Removing a required field declared in a parent schema.
 *   - YAML syntax error (bad indentation, missing colon).
 *   - Renaming a security scheme without updating endpoint `security:` refs.
 *
 * Style-only rules (operation-operationId, no-server-example.com,
 * operation-4xx-response) are downgraded to `warn` in `redocly.yaml` so they
 * do not turn this drift gate into a style nag — see commit
 * "chore(36): install @redocly/cli + markdown-link-check ... (D-08, D-24)"
 * for the rationale.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Three levels up from server/__tests__/openapi/ → repo root.
const REPO_ROOT = resolve(__dirname, '../../..');
const SPEC = resolve(REPO_ROOT, 'server/openapi.yaml');

describe('Phase 36 D-08 — OpenAPI spec drift gate', () => {
  it('redocly lint exits 0 (no spec syntax errors, no broken $refs, no missing required fields)', () => {
    const result = spawnSync('npx', ['@redocly/cli', 'lint', SPEC, '--format=stylish'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 60_000,
    });
    if (result.status !== 0) {
      // Surface stdout + stderr on failure so the operator sees exactly
      // which line / $ref / required-field is broken. Vitest displays
      // console.error output on failed assertions.

      console.error('Redocly lint stdout:\n' + (result.stdout ?? ''));

      console.error('Redocly lint stderr:\n' + (result.stderr ?? ''));
    }
    expect(
      result.status,
      `Redocly lint failed:\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    ).toBe(0);
  });
});
