import { logger } from '../lib/logger.js';

import { AppError } from './errorHandler.js';

import type { Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

const log = logger.child({ module: 'validateResponse' });

/**
 * Validate an outgoing JSON response against a Zod schema before sending.
 *
 * Purpose: catch drift between the OpenAPI response contract and actual
 * route handlers at the I/O boundary — a Palantir-grade belt-and-suspenders
 * check that complements query validation on the input side.
 *
 * Semantics:
 *  - Happy path: schema matches → `res.json(parsed.data)` (strips unknown
 *    fields via zod's default parsing behavior; the schemas are marked
 *    `.passthrough()` where drift-tolerance matters).
 *  - Dev mismatch (`NODE_ENV !== 'production'`): throw an AppError so the
 *    central errorHandler returns a consistent 500 envelope. Developers
 *    see the contract violation immediately in local runs and CI.
 *  - Prod mismatch: log a warn via the module-scoped pino child logger
 *    (including the Zod issue array for forensics) and fall through with
 *    `res.json(payload)` — avoid cascading a user-visible failure from a
 *    schema drift bug.
 *
 * The helper is intentionally tiny and type-erased on the return channel;
 * callers pass the payload alongside the schema and let zod infer the
 * response shape from the schema generic.
 */
export function sendValidated<S extends ZodTypeAny>(
  res: Response,
  schema: S,
  payload: unknown,
): void {
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    const issues = parsed.error.issues;
    const path = (res.req as { path?: string } | undefined)?.path ?? 'unknown';

    if (process.env.NODE_ENV !== 'production') {
      throw new AppError(
        500,
        'RESPONSE_SCHEMA_MISMATCH',
        `Response validation failed at ${path}: ${JSON.stringify(issues)}`,
      );
    }

    log.warn({ issues, path }, 'response schema mismatch — sending unvalidated payload');
    res.json(payload);
    return;
  }

  res.json(parsed.data as z.infer<S>);
}
