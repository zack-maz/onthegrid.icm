import { config } from '../config.js';
import type { ConflictEventEntity } from '../types.js';

const ACLED_TOKEN_URL = 'https://acleddata.com/oauth/token';
const ACLED_API_URL = 'https://acleddata.com/api';

// 16 Greater Middle East countries for comprehensive conflict event coverage
export const GREATER_MIDDLE_EAST_COUNTRIES =
  'Iran|Iraq|Syria|Turkey|Saudi Arabia|Yemen|Oman|United Arab Emirates|Qatar|Bahrain|Kuwait|Jordan|Israel|Lebanon|Afghanistan|Pakistan';

// Token cache (23-hour TTL, safe margin under 24-hour expiry)
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getACLEDToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'acled',
    username: config.acled.email,
    password: config.acled.password,
  });

  const res = await fetch(ACLED_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`ACLED OAuth2 token request failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000, // 23 hours
  };

  return cachedToken.token;
}

function classifyEventType(subEventType: string): 'missile' | 'drone' {
  const lower = subEventType.toLowerCase();
  if (lower.includes('drone') || lower.includes('air')) return 'drone';
  if (lower.includes('shelling') || lower.includes('artillery') || lower.includes('missile'))
    return 'missile';
  // Default to missile for other conflict types
  return 'missile';
}

function normalizeEvent(event: Record<string, unknown>): ConflictEventEntity {
  const subEventType = String(event.sub_event_type ?? '');
  return {
    id: `event-${event.event_id_cnty}`,
    type: classifyEventType(subEventType),
    lat: Number(event.latitude),
    lng: Number(event.longitude),
    timestamp: new Date(String(event.event_date)).getTime(),
    label: `${event.event_type}: ${event.sub_event_type}`,
    data: {
      eventType: String(event.event_type ?? ''),
      subEventType,
      fatalities: Number(event.fatalities ?? 0),
      actor1: String(event.actor1 ?? ''),
      actor2: String(event.actor2 ?? ''),
      notes: String(event.notes ?? ''),
      source: String(event.source ?? ''),
    },
  };
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function fetchEvents(): Promise<ConflictEventEntity[]> {
  const start = Date.now();
  const token = await getACLEDToken();

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dateFrom = formatDate(sevenDaysAgo);
  const dateTo = formatDate(now);

  const fields = [
    'event_id_cnty',
    'event_date',
    'event_type',
    'sub_event_type',
    'actor1',
    'actor2',
    'country',
    'latitude',
    'longitude',
    'fatalities',
    'notes',
    'source',
    'geo_precision',
  ].join('|');

  const params = new URLSearchParams({
    country: GREATER_MIDDLE_EAST_COUNTRIES,
    event_date: `${dateFrom}|${dateTo}`,
    event_date_where: 'BETWEEN',
    fields,
    limit: '500',
    _format: 'json',
  });

  const url = `${ACLED_API_URL}/acled/read?${params.toString()}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`ACLED API request failed: ${res.status}`);
  }

  const json = (await res.json()) as {
    status: number;
    success: boolean;
    data: Record<string, unknown>[];
  };

  const events = json.data.map(normalizeEvent);

  console.log(`[acled] fetched ${events.length} events in ${Date.now() - start}ms`);
  return events;
}
