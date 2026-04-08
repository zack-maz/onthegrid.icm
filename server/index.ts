import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { cacheControl } from './middleware/cacheControl.js';
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
import { cronWarmRouter } from './routes/cron-warm.js';
export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
  app.use(express.json());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://va.vercel-scripts.com'],
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
  // Compress responses in local dev. Vercel CDN handles gzip/brotli at the
  // edge, so skip in production to avoid double-compression overhead.
  if (!process.env.VERCEL) {
    app.use(compression());
  }

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
      autoLogging: { ignore: (req) => req.url === '/health' },
      customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
      customErrorMessage: (req, _res, err) => `${req.method} ${req.url} failed: ${err.message}`,
    }),
  );

  // Propagate request ID to response headers for traceability
  app.use((req, res, next) => {
    res.setHeader('X-Request-ID', req.id as string);
    next();
  });

  // Health check (no cache, no rate limit)
  app.use('/health', healthRouter);

  // Cron endpoints (no cache, no rate limit — triggered by Vercel cron)
  app.use('/api/cron/health', cronHealthRouter);
  app.use('/api/cron/warm', cronWarmRouter);

  // Portfolio demo baseline rate limit — runs on every /api/* request
  // BEFORE the per-endpoint limiters below. 6 req/min per IP. Prevents
  // scraper abuse of the public demo URL without affecting legitimate
  // browser traffic (which polls at 5-60s cadences). See JSDoc on
  // rateLimiters.public for rationale.
  app.use('/api', rateLimiters.public);

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
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMainModule) {
  try {
    const port = Number(process.env.PORT ?? 3001);
    const app = createApp();

    const server = app.listen(port, () => {
      logger.info({ port }, 'server listening');
    });

    // Graceful shutdown: drain open connections before exiting
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, draining connections...');
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      // Force exit after 10s if graceful shutdown hangs
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10_000).unref();
    });
  } catch (err) {
    logger.error({ err }, 'server failed to start');
    process.exit(1);
  }
}
