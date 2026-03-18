// MapEntity discriminated union -- shared data contract between server and frontend

export interface MapEntityBase {
  id: string;
  type: EntityType;
  lat: number;
  lng: number;
  timestamp: number; // Unix ms
  label: string;
}

export type EntityType = 'flight' | 'ship' | 'missile' | 'drone';

export interface FlightEntity extends MapEntityBase {
  type: 'flight';
  data: {
    icao24: string;
    callsign: string;
    originCountry: string;
    velocity: number | null; // m/s
    heading: number | null; // degrees
    altitude: number | null; // meters
    onGround: boolean;
    verticalRate: number | null; // m/s
    unidentified: boolean; // true when callsign is empty (hex-only, often military)
  };
}

export interface ShipEntity extends MapEntityBase {
  type: 'ship';
  data: {
    mmsi: number;
    shipName: string;
    speedOverGround: number; // knots
    courseOverGround: number; // degrees
    trueHeading: number; // degrees
  };
}

export interface ConflictEventEntity extends MapEntityBase {
  type: 'missile' | 'drone';
  data: {
    eventType: string; // ACLED event_type
    subEventType: string; // ACLED sub_event_type
    fatalities: number;
    actor1: string;
    actor2: string;
    notes: string;
    source: string;
    goldsteinScale: number; // GDELT Goldstein conflict scale (-10 to +10)
    locationName: string; // ActionGeo_FullName
    cameoCode: string; // CAMEO event code (e.g. "190")
  };
}

export type MapEntity = FlightEntity | ShipEntity | ConflictEventEntity;

export interface BoundingBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface CacheResponse<T> {
  data: T;
  stale: boolean;
  lastFresh: number; // Unix ms of last successful fetch
}

export type FlightSource = 'opensky' | 'adsb' | 'adsblol';

export class RateLimitError extends Error {
  name: string;
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}
