import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { flightsRouter } from './routes/flights.js';
import { shipsRouter } from './routes/ships.js';
import { eventsRouter } from './routes/events.js';
import { sourcesRouter } from './routes/sources.js';
import { sitesRouter } from './routes/sites.js';
import { newsRouter } from './routes/news.js';
import { marketsRouter } from './routes/markets.js';
export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Rate limiting on API routes only (not /health)
  app.use('/api', rateLimitMiddleware);

  // Data source routes
  app.use('/api/flights', flightsRouter);
  app.use('/api/ships', shipsRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/sources', sourcesRouter);
  app.use('/api/sites', sitesRouter);
  app.use('/api/news', newsRouter);
  app.use('/api/markets', marketsRouter);

  // Error handler -- must be after routes
  app.use(errorHandler);

  return app;
}

// Only start listening when run directly (not imported for testing)
const isMainModule =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMainModule) {
  try {
    const port = Number(process.env.PORT ?? 3001);
    const app = createApp();

    app.listen(port, () => {
      console.log(`[server] listening on port ${port}`);
    });
  } catch (err) {
    console.error('[server] Failed to start:', (err as Error).message);
    process.exit(1);
  }
}
