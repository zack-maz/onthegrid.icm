#!/usr/bin/env tsx
/**
 * Drift check: every key declared in server/config.ts Zod schema must appear
 * in .env.example. Conversely, every key in .env.example must exist in the
 * schema (no orphans from removed env vars).
 *
 * Exit 1 with diff if drift is found, exit 0 if clean.
 *
 * Usage: npx tsx scripts/check-env-example.ts
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';

// Force test mode BEFORE the dynamic import of server/config.ts so that
// parseEnv() returns safe defaults instead of throwing on missing Redis credentials.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

interface CheckResult {
  declaredKeys: Set<string>;
  requiredKeys: string[];
  missing: string[];
  extras: string[];
}

function parseEnvExampleKeys(content: string): Set<string> {
  return new Set(
    content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => {
        const eqIdx = line.indexOf('=');
        return eqIdx === -1 ? line : line.slice(0, eqIdx);
      })
      .map((key) => key.trim())
      .filter((key) => key.length > 0),
  );
}

async function check(): Promise<CheckResult> {
  // Dynamic import so the NODE_ENV assignment above runs first.
  const { envSchema } = await import('../server/config.ts');

  const envExample = readFileSync('.env.example', 'utf8');
  const declaredKeys = parseEnvExampleKeys(envExample);

  // envSchema is a ZodObject; .shape lists the keys.
  const schemaShape = (envSchema as z.ZodObject<z.ZodRawShape>).shape;
  const requiredKeys = Object.keys(schemaShape);

  const missing = requiredKeys.filter((k) => !declaredKeys.has(k));
  const extras = [...declaredKeys].filter((k) => !requiredKeys.includes(k));

  return { declaredKeys, requiredKeys, missing, extras };
}

async function main(): Promise<number> {
  const result = await check();

  if (result.missing.length === 0 && result.extras.length === 0) {
    console.log(
      `OK: .env.example matches server/config.ts schema (${result.requiredKeys.length} keys)`,
    );
    return 0;
  }

  if (result.missing.length > 0) {
    console.error('MISSING from .env.example:');
    for (const k of result.missing) console.error(`  - ${k}`);
  }
  if (result.extras.length > 0) {
    console.warn('EXTRA in .env.example (not in schema):');
    for (const k of result.extras) console.warn(`  - ${k}`);
  }
  return 1;
}

main().then((code) => process.exit(code));
