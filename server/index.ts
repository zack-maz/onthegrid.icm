import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import { flightsRouter } from './routes/flights.js';
import { shipsRouter } from './routes/ships.js';
import { eventsRouter } from './routes/events.js';
import { connectAISStream } from './adapters/aisstream.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Data source routes
  app.use('/api/flights', flightsRouter);
  app.use('/api/ships', shipsRouter);
  app.use('/api/events', eventsRouter);

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

    // Start AISStream WebSocket connection only if credentials are available
    if (!process.env.VITEST) {
      if (process.env.AISSTREAM_API_KEY) {
        connectAISStream();
      } else {
        console.log('[server] AISSTREAM_API_KEY not set, skipping AIS WebSocket connection');
      }
    }

    app.listen(port, () => {
      console.log(`[server] listening on port ${port}`);
    });
  } catch (err) {
    console.error('[server] Failed to start:', (err as Error).message);
    process.exit(1);
  }
}
