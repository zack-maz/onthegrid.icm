import type { ShipEntity } from '../types.js';
import { IRAN_BBOX } from '../config.js';

const DEFAULT_COLLECT_MS = 5000;

/**
 * On-demand ship data collection via AISStream WebSocket.
 *
 * Opens a WebSocket, subscribes to PositionReport messages within IRAN_BBOX,
 * collects messages for AISSTREAM_COLLECT_MS milliseconds (default 5000),
 * then closes the connection and returns the collected ships.
 *
 * Deduplicates by MMSI -- later messages overwrite earlier for the same ship.
 */
export async function collectShips(): Promise<ShipEntity[]> {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    throw new Error('AISSTREAM_API_KEY is not set');
  }

  const collectMs = Number(process.env.AISSTREAM_COLLECT_MS) || DEFAULT_COLLECT_MS;

  return new Promise<ShipEntity[]>((resolve, reject) => {
    const collected = new Map<number, ShipEntity>();
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    let timer: ReturnType<typeof setTimeout>;

    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: [
            [
              [IRAN_BBOX.south, IRAN_BBOX.west],
              [IRAN_BBOX.north, IRAN_BBOX.east],
            ],
          ],
          FilterMessageTypes: ['PositionReport'],
        }),
      );
    });

    ws.addEventListener('message', async (event) => {
      const raw = event.data instanceof Blob ? await event.data.text() : String(event.data);
      const msg = JSON.parse(raw) as {
        MessageType: string;
        Message: {
          PositionReport: {
            UserID: number;
            Latitude: number;
            Longitude: number;
            Sog: number;
            Cog: number;
            TrueHeading: number;
          };
        };
        MetaData: {
          MMSI: number;
          ShipName: string;
          latitude: number;
          longitude: number;
          time_utc: string;
        };
      };

      if (msg.MessageType === 'PositionReport') {
        const report = msg.Message.PositionReport;
        const meta = msg.MetaData;
        const entity: ShipEntity = {
          id: `ship-${meta.MMSI}`,
          type: 'ship',
          lat: report.Latitude,
          lng: report.Longitude,
          timestamp: new Date(meta.time_utc).getTime(),
          label: meta.ShipName?.trim() || `MMSI ${meta.MMSI}`,
          data: {
            mmsi: meta.MMSI,
            shipName: meta.ShipName?.trim() || '',
            speedOverGround: report.Sog,
            courseOverGround: report.Cog,
            trueHeading: report.TrueHeading,
          },
        };
        collected.set(meta.MMSI, entity);
      }
    });

    timer = setTimeout(() => {
      ws.close();
      resolve(Array.from(collected.values()));
    }, collectMs);

    ws.addEventListener('error', () => {
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      reject(new Error('AISStream WebSocket connection failed'));
    });
  });
}
