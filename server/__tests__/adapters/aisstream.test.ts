// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config module
vi.mock('../../config.js', () => ({
  config: {
    aisstream: {
      apiKey: 'test-ais-api-key',
    },
  },
}));

// Fake WebSocket class for testing
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  listeners: Record<string, Array<(event: unknown) => void>> = {};
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(event: string, handler: (event: unknown) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  // Simulate server events
  simulateOpen(): void {
    for (const handler of this.listeners['open'] ?? []) {
      handler({});
    }
  }

  simulateMessage(data: unknown): void {
    for (const handler of this.listeners['message'] ?? []) {
      handler({ data: JSON.stringify(data) });
    }
  }

  simulateClose(): void {
    for (const handler of this.listeners['close'] ?? []) {
      handler({});
    }
  }
}

// Sample AISStream message
const samplePositionReport = {
  MessageType: 'PositionReport',
  Message: {
    PositionReport: {
      UserID: 123456789,
      Latitude: 27.5,
      Longitude: 52.3,
      Sog: 12.5,
      Cog: 180.0,
      TrueHeading: 175,
    },
  },
  MetaData: {
    MMSI: 123456789,
    ShipName: 'TEST VESSEL',
    latitude: 27.5,
    longitude: 52.3,
    time_utc: '2026-03-15T10:00:00Z',
  },
};

describe('AISStream Adapter', () => {
  let getShips: typeof import('../../adapters/aisstream.js').getShips;
  let getLastMessageTime: typeof import('../../adapters/aisstream.js').getLastMessageTime;
  let connectAISStream: typeof import('../../adapters/aisstream.js').connectAISStream;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T00:00:00Z'));
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('setTimeout', vi.fn());

    // Reset module state between tests
    vi.resetModules();
    const mod = await import('../../adapters/aisstream.js');
    getShips = mod.getShips;
    getLastMessageTime = mod.getLastMessageTime;
    connectAISStream = mod.connectAISStream;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends subscription with correct bbox and API key on open', () => {
    connectAISStream();

    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe('wss://stream.aisstream.io/v0/stream');

    // Simulate connection open
    ws.simulateOpen();

    expect(ws.sentMessages).toHaveLength(1);
    const subscription = JSON.parse(ws.sentMessages[0]);
    expect(subscription.APIKey).toBe('test-ais-api-key');
    expect(subscription.BoundingBoxes).toEqual([
      [[25.0, 44.0], [40.0, 63.5]],
    ]);
    expect(subscription.FilterMessageTypes).toEqual(['PositionReport']);
  });

  it('normalizes PositionReport messages to ShipEntity and stores in Map', () => {
    connectAISStream();
    const ws = FakeWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage(samplePositionReport);

    const ships = getShips();
    expect(ships).toHaveLength(1);
    const ship = ships[0];
    expect(ship.id).toBe('ship-123456789');
    expect(ship.type).toBe('ship');
    expect(ship.lat).toBe(27.5);
    expect(ship.lng).toBe(52.3);
    expect(ship.label).toBe('TEST VESSEL');
    expect(ship.data.mmsi).toBe(123456789);
    expect(ship.data.shipName).toBe('TEST VESSEL');
    expect(ship.data.speedOverGround).toBe(12.5);
    expect(ship.data.courseOverGround).toBe(180.0);
    expect(ship.data.trueHeading).toBe(175);
  });

  it('getShips() returns all stored ships', () => {
    connectAISStream();
    const ws = FakeWebSocket.instances[0];
    ws.simulateOpen();

    // Add two different ships
    ws.simulateMessage(samplePositionReport);
    ws.simulateMessage({
      ...samplePositionReport,
      Message: {
        PositionReport: {
          ...samplePositionReport.Message.PositionReport,
          UserID: 987654321,
          Latitude: 30.0,
          Longitude: 50.0,
        },
      },
      MetaData: {
        ...samplePositionReport.MetaData,
        MMSI: 987654321,
        ShipName: 'SECOND VESSEL',
      },
    });

    const ships = getShips();
    expect(ships).toHaveLength(2);
  });

  it('upserts duplicate MMSI entries', () => {
    connectAISStream();
    const ws = FakeWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage(samplePositionReport);
    expect(getShips()).toHaveLength(1);
    expect(getShips()[0].lat).toBe(27.5);

    // Same MMSI, new position
    ws.simulateMessage({
      ...samplePositionReport,
      Message: {
        PositionReport: {
          ...samplePositionReport.Message.PositionReport,
          Latitude: 28.0,
          Longitude: 53.0,
        },
      },
    });

    const ships = getShips();
    expect(ships).toHaveLength(1); // Still 1 ship
    expect(ships[0].lat).toBe(28.0); // Updated position
  });

  it('getLastMessageTime() returns timestamp of most recent message', () => {
    expect(getLastMessageTime()).toBe(0); // No messages yet

    connectAISStream();
    const ws = FakeWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage(samplePositionReport);

    expect(getLastMessageTime()).toBeGreaterThan(0);
  });

  it('reconnects on WebSocket close with 5-second delay', () => {
    connectAISStream();
    const ws = FakeWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateClose();

    const mockSetTimeout = vi.mocked(globalThis.setTimeout);
    expect(mockSetTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      5000,
    );
  });
});
