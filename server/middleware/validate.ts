import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

/**
 * Express middleware factory for Zod query param validation.
 * Parses req.query against the given schema, storing validated data on res.locals.validatedQuery.
 * Returns 400 with consistent error shape on validation failure.
 *
 * NOTE: Express 5 makes req.query a read-only getter, so we cannot overwrite it.
 * Route handlers should read from res.locals.validatedQuery instead.
 */
export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    res.locals.validatedQuery = result.data;
    next();
  };
}
