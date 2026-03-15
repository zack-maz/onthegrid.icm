import { config } from '../config.js';
import type { ShipEntity } from '../types.js';
import { IRAN_BBOX } from '../constants.js';

// In-memory store of current ship positions, keyed by MMSI
const ships = new Map<number, ShipEntity>();
let lastMessageTime = 0;

export function getShips(): ShipEntity[] {
  return Array.from(ships.values());
}

export function getLastMessageTime(): number {
  return lastMessageTime;
}

export function connectAISStream(): void {
  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

  ws.addEventListener('open', () => {
    console.log('[aisstream] connected');
    // Must send subscription within 3 seconds of connection open
    ws.send(
      JSON.stringify({
        APIKey: config.aisstream.apiKey,
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

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data)) as {
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
      ships.set(meta.MMSI, entity);
      lastMessageTime = Date.now();
    }
  });

  ws.addEventListener('close', () => {
    console.log('[aisstream] disconnected, reconnecting in 5s...');
    setTimeout(connectAISStream, 5000);
  });

  ws.addEventListener('error', (err) => {
    console.error('[aisstream] error:', err);
  });
}
