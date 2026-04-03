import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler.js';
import { cacheControl } from './middleware/cacheControl.js';
import { requestLogger } from './middleware/requestLogger.js';
import { rateLimiters } from './middleware/rateLimit.js';
import { flightsRouter } from './routes/flights.js';
import { shipsRouter } from './routes/ships.js';
import { eventsRouter } from './routes/events.js';
import { sourcesRouter } from './routes/sources.js';
import { sitesRouter } from './routes/sites.js';
import { newsRouter } from './routes/news.js';
import { marketsRouter } from './routes/markets.js';
import { weatherRouter } from './routes/weather.js';
import { geocodeRouter } from './routes/geocode.js';
import { waterRouter } from './routes/water.js';
import { healthRouter } from './routes/health.js';
import { cronHealthRouter } from './routes/cron-health.js';
export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
  app.use(express.json());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://va.vercel-scripts.com',
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: [
            "'self'",
            'data:',
            'blob:',
            'https://*.tile.openstreetmap.org',
            'https://*.amazonaws.com',
            'https://server.arcgisonline.com',
            'https://basemaps.cartocdn.com',
          ],
          connectSrc: [
            "'self'",
            'https://*.tile.openstreetmap.org',
            'https://*.amazonaws.com',
            'https://api.open-meteo.com',
            'https://va.vercel-scripts.com',
            'https://basemaps.cartocdn.com',
          ],
          workerSrc: ["'self'", 'blob:'],
        },
      },
    }),
  );
  app.use(requestLogger);

  // Health check (no cache, no rate limit)
  app.use('/health', healthRouter);

  // Cron health check (no cache, no rate limit — triggered by Vercel cron)
  app.use('/api/cron/health', cronHealthRouter);

  // Data source routes with per-endpoint rate limits and cache-control
  app.use('/api/flights', rateLimiters.flights, cacheControl(5, 25), flightsRouter);
  app.use('/api/ships', rateLimiters.ships, cacheControl(10, 20), shipsRouter);
  app.use('/api/events', rateLimiters.events, cacheControl(300, 600), eventsRouter);
  app.use('/api/sources', rateLimiters.sources, cacheControl(60, 60), sourcesRouter);
  app.use('/api/sites', rateLimiters.sites, cacheControl(3600, 82800), sitesRouter);
  app.use('/api/news', rateLimiters.news, cacheControl(300, 600), newsRouter);
  app.use('/api/markets', rateLimiters.markets, cacheControl(30, 30), marketsRouter);
  app.use('/api/weather', rateLimiters.weather, cacheControl(600, 1200), weatherRouter);
  app.use('/api/geocode', rateLimiters.geocode, cacheControl(86400, 86400), geocodeRouter);
  app.use('/api/water', rateLimiters.water, cacheControl(3600, 82800), waterRouter);

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
