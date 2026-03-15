import { Router } from 'express';
import { getShips, getLastMessageTime } from '../adapters/aisstream.js';

export const shipsRouter = Router();

shipsRouter.get('/', (_req, res) => {
  const data = getShips();
  const lastMsg = getLastMessageTime();
  // Stale if never connected (0) or no message in 60 seconds
  const stale = lastMsg === 0 || Date.now() - lastMsg > 60_000;

  res.json({ data, stale, lastFresh: lastMsg });
});
