import { createApp } from './index.js';

import type { IncomingMessage, ServerResponse } from 'node:http';

// Vercel handles its own SIGTERM (500ms window) — no custom shutdown handler needed.
// Upstash Redis is REST-based, so there are no persistent connections to drain.
// If async pino transport is added later, add pino.final() here for log flushing.

let app: ReturnType<typeof createApp> | null = null;
let initError: string | null = null;

try {
  app = createApp();
} catch (err) {
  initError = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (initError || !app) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: initError ?? 'app is null' }));
    return;
  }
  app(req, res);
}
