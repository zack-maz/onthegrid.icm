/**
 * Production smoke test — validates all API endpoints return 200 with valid JSON.
 *
 * Usage:
 *   npx tsx scripts/smoke-test.ts https://your-app.vercel.app
 *   npx tsx scripts/smoke-test.ts http://localhost:3001
 */

const BASE_URL = process.argv[2];

if (!BASE_URL) {
  console.error('Usage: npx tsx scripts/smoke-test.ts <base-url>');
  process.exit(1);
}

interface EndpointSpec {
  path: string;
  /** Key expected in the JSON response */
  expectedKey: string;
  /** Whether to check for Cache-Control header (Vercel CDN consumes s-maxage, so check max-age presence) */
  checkCache: boolean;
}

const ENDPOINTS: EndpointSpec[] = [
  { path: '/api/flights', expectedKey: 'data', checkCache: true },
  { path: '/api/ships', expectedKey: 'data', checkCache: true },
  { path: '/api/events', expectedKey: 'data', checkCache: true },
  { path: '/api/news', expectedKey: 'data', checkCache: true },
  { path: '/api/markets', expectedKey: 'data', checkCache: true },
  { path: '/api/weather', expectedKey: 'data', checkCache: true },
  { path: '/api/sites', expectedKey: 'data', checkCache: true },
  { path: '/api/sources', expectedKey: 'opensky', checkCache: true },
  { path: '/health', expectedKey: 'status', checkCache: false },
];

interface Result {
  path: string;
  pass: boolean;
  status: number;
  cacheOk: boolean | null;
  error?: string;
}

async function testEndpoint(spec: EndpointSpec): Promise<Result> {
  const url = `${BASE_URL.replace(/\/$/, '')}${spec.path}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });

    if (!res.ok) {
      return {
        path: spec.path,
        pass: false,
        status: res.status,
        cacheOk: null,
        error: `HTTP ${res.status}`,
      };
    }

    const json = await res.json();

    if (!(spec.expectedKey in json)) {
      return {
        path: spec.path,
        pass: false,
        status: res.status,
        cacheOk: null,
        error: `Missing key "${spec.expectedKey}" in response`,
      };
    }

    let cacheOk: boolean | null = null;
    if (spec.checkCache) {
      const cc = res.headers.get('cache-control') ?? '';
      // Vercel CDN consumes s-maxage internally; check for max-age or s-maxage
      cacheOk = /(?:s-)?max-age=\d+/.test(cc);
    }

    return { path: spec.path, pass: true, status: res.status, cacheOk };
  } catch (err) {
    return {
      path: spec.path,
      pass: false,
      status: 0,
      cacheOk: null,
      error: (err as Error).message,
    };
  }
}

async function main() {
  console.log(`\nSmoke testing: ${BASE_URL}\n`);

  const results = await Promise.all(ENDPOINTS.map(testEndpoint));

  let failures = 0;
  for (const r of results) {
    const icon = r.pass ? 'PASS' : 'FAIL';
    const cache =
      r.cacheOk === null ? '' : r.cacheOk ? ' [cache: ok]' : ' [cache: MISSING]';
    const err = r.error ? ` (${r.error})` : '';
    console.log(`  ${icon}  ${r.path}  [${r.status}]${cache}${err}`);
    if (!r.pass) failures++;
    if (r.cacheOk === false) failures++;
  }

  console.log(`\n${results.length - failures}/${results.length} checks passed\n`);

  if (failures > 0) {
    process.exit(1);
  }
}

main();
