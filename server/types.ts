// MapEntity discriminated union -- shared data contract between server and frontend

export interface MapEntityBase {
  id: string;
  type: EntityType;
  lat: number;
  lng: number;
  timestamp: number; // Unix ms
  label: string;
}

export type ConflictEventType = 'airstrike' | 'on_ground' | 'explosion' | 'targeted' | 'other';

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
    numMentions?: number; // GDELT NumMentions (col 31) — optional for backward compat
    numSources?: number; // GDELT NumSources (col 32) — optional for backward compat
    geoPrecision?: 'precise' | 'centroid'; // City-centroid detection result
    confidence?: number; // 0-1 composite confidence score
    actionGeoType?: number; // GDELT ActionGeo_Type (1=country, 2=state, 3=city, 4=landmark)
    originalLat?: number; // Pre-dispersion centroid latitude (set for dispersed events)
    originalLng?: number; // Pre-dispersion centroid longitude (set for dispersed events)
    // LLM-enriched fields (present when LLM processed the event)
    summary?: string; // 2-3 sentence situation summary
    casualties?: { killed?: number; injured?: number; unknown?: boolean };
    precision?: 'exact' | 'neighborhood' | 'city' | 'region';
    actors?: string[]; // All actors (richer than actor1/actor2)
    sourceCount?: number; // Number of independent sources
    llmProcessed?: boolean; // true when LLM enriched this event
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
  degraded?: boolean; // true when serving from in-memory fallback (Redis unavailable)
}

export type SiteType = 'nuclear' | 'naval' | 'oil' | 'airbase' | 'port';

export interface SiteEntity {
  id: string; // "site-{osmId}"
  type: 'site';
  siteType: SiteType;
  lat: number;
  lng: number;
  label: string; // OSM name tag
  operator?: string; // OSM operator tag
  wikidata?: string; // Wikidata QID (e.g. "Q83459") for thumbnail lookup
  osmId: number;
}

export interface NewsArticle {
  id: string; // SHA-256 hash of URL (hex, truncated to 16 chars)
  title: string;
  url: string;
  source: string; // "GDELT", "BBC", "Al Jazeera", "Tehran Times", "Times of Israel", "Middle East Eye"
  sourceCountry?: string; // Country of origin of the news source (e.g., "United Kingdom", "Qatar")
  publishedAt: number; // Unix ms
  summary?: string;
  imageUrl?: string;
  lat?: number;
  lng?: number;
  tone?: number; // Reserved for Phase 17 (always undefined in Phase 16)
  keywords: string[]; // Matched whitelist keywords
  actor?: string; // NLP-extracted actor from headline/summary
  action?: string; // NLP-extracted action verb/phrase
  target?: string; // NLP-extracted target of the action
  relevanceScore?: number; // 0-1 NLP-based relevance confidence score
}

export interface NewsCluster {
  id: string; // Same as primaryArticle.id
  primaryArticle: NewsArticle;
  articles: NewsArticle[]; // All articles in cluster (including primary)
  firstSeen: number; // Earliest publishedAt
  lastUpdated: number; // Latest publishedAt in cluster
}

export type FlightSource = 'opensky' | 'adsblol';

export interface MarketQuote {
  symbol: string; // "BZ=F", "CL=F", "XLE", "USO", "XOM"
  displayName: string; // "Brent", "WTI", "XLE", "USO", "XOM"
  price: number; // regularMarketPrice
  previousClose: number; // For delta calculation
  change: number; // price - previousClose
  changePercent: number; // ((price - previousClose) / previousClose) * 100
  currency: string; // "USD"
  marketOpen: boolean; // Derived from currentTradingPeriod.regular
  lastTradeTime: number; // Unix ms
  history: {
    timestamps: number[]; // Unix ms
    closes: number[]; // Daily close prices (nulls filtered)
    highs: number[]; // Daily high prices (nulls filtered)
    lows: number[]; // Daily low prices (nulls filtered)
  };
}

export interface WeatherGridPoint {
  lat: number;
  lng: number;
  temperature: number; // Celsius
  windSpeed: number; // knots
  windDirection: number; // degrees (0-360)
}

// ---------- Water Stress Types ----------

export type WaterFacilityType = 'dam' | 'reservoir' | 'desalination' | 'treatment_plant';

export interface WaterStressIndicators {
  bws_raw: number; // baseline water stress raw value
  bws_score: number; // 0-5 normalized score
  bws_label: string; // human label
  drr_score: number; // drought risk 0-5
  gtd_score: number; // groundwater table decline 0-5
  sev_score: number; // seasonal variability 0-5
  iav_score: number; // interannual variability 0-5
  compositeHealth: number; // 0-1 (0=worst, 1=best)
}

export interface WaterFacility {
  id: string; // "water-{osmId}"
  type: 'water';
  facilityType: WaterFacilityType;
  lat: number;
  lng: number;
  label: string;
  operator?: string;
  osmId: number;
  stress: WaterStressIndicators;
  precipitation?: {
    last30DaysMm: number;
    anomalyRatio: number;
    updatedAt: number;
  };
}

export class RateLimitError extends Error {
  name: string;
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}
