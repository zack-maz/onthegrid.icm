import type { Request, Response, NextFunction } from 'express';
import { log } from '../lib/logger.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  log({
    level: 'error',
    message: err.message,
    method: req.method,
    path: req.path,
  });
  res.status(500).json({ error: 'Internal server error' });
}
