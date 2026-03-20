// MapEntity discriminated union -- shared data contract between server and frontend

export interface MapEntityBase {
  id: string;
  type: EntityType;
  lat: number;
  lng: number;
  timestamp: number; // Unix ms
  label: string;
}

export type ConflictEventType =
  | 'airstrike'
  | 'ground_combat'
  | 'shelling'
  | 'bombing'
  | 'assassination'
  | 'abduction'
  | 'assault'
  | 'blockade'
  | 'ceasefire_violation'
  | 'mass_violence'
  | 'wmd';

export type EntityType = 'flight' | 'ship' | ConflictEventType;

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
  type: ConflictEventType;
  data: {
    eventType: string; // Human-readable CAMEO description
    subEventType: string; // "CAMEO <code>"
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

export type SiteType = 'nuclear' | 'naval' | 'oil' | 'airbase' | 'desalination' | 'port';

export interface SiteEntity {
  id: string; // "site-{osmId}"
  type: 'site';
  siteType: SiteType;
  lat: number;
  lng: number;
  label: string; // OSM name tag
  operator?: string; // OSM operator tag
  osmId: number;
}

export interface NewsArticle {
  id: string; // SHA-256 hash of URL (hex, truncated to 16 chars)
  title: string;
  url: string;
  source: string; // "GDELT", "BBC", "Al Jazeera", "Tehran Times", "Times of Israel", "Middle East Eye"
  publishedAt: number; // Unix ms
  summary?: string;
  imageUrl?: string;
  lat?: number;
  lng?: number;
  tone?: number; // Reserved for Phase 17 (always undefined in Phase 16)
  keywords: string[]; // Matched whitelist keywords
}

export interface NewsCluster {
  id: string; // Same as primaryArticle.id
  primaryArticle: NewsArticle;
  articles: NewsArticle[]; // All articles in cluster (including primary)
  firstSeen: number; // Earliest publishedAt
  lastUpdated: number; // Latest publishedAt in cluster
}

export type FlightSource = 'opensky' | 'adsb' | 'adsblol';

export class RateLimitError extends Error {
  name: string;
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}
