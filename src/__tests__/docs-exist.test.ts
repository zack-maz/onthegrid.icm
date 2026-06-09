/**
 * Wave-0 RED stub — REVEAL-DOCS doc-path existence contract.
 *
 * Asserts the 7 portfolio docs Plans 01-03 author exist at their D-05/D-08
 * paths. RED today because none exist yet; goes GREEN as each docs wave lands.
 * (Optional per 41-VALIDATION, but cheap and pins the deliverable set.)
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

const REQUIRED_DOCS = [
  'docs/BUILDING-WITH-CLAUDE-CODE.md',
  'docs/SHOWCASE.md',
  'docs/JOURNEY.md',
  'docs/concepts.md',
  'docs/COSTS.md',
  'docs/operator-guide.md',
  'docs/LESSONS.md',
];

describe('portfolio docs existence (REVEAL-DOCS-01..09)', () => {
  for (const rel of REQUIRED_DOCS) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(ROOT, rel)), `${rel} should exist`).toBe(true);
    });
  }
});
