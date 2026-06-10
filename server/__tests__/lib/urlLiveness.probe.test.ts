// @vitest-environment node
/**
 * Phase 32 Plan 32-02 Task 1 — `probeUrl` mocked-fetch matrix.
 *
 * Pins the D-16 (HEAD-then-GET on 405) + D-17 (≤3 redirect hops with
 * `redirect: 'manual'`) + D-21 (User-Agent literal) + defense-in-depth
 * SSRF guard contracts. Every status taxonomy branch from
 * `UrlLivenessStatusSchema` (`live | 404 | 403 | dead-host | unknown`)
 * has a dedicated test case so future refactors of `probeUrl` fail loudly
 * on regression.
 *
 * Mock strategy mirrors `server/__tests__/lib/freeClaudeRouter.test.ts`:
 * `vi.stubGlobal('fetch', fetchMock)` + `vi.mock('../../cache/redis.js')`
 * + `vi.mock('../../lib/logger.js')`. Dynamic import after mocks are
 * registered so the module-under-test consumes the mocked surface.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Sanity guard — MEDIUM-02 plan-checker fix. If the runner ever stops
// forcing NODE_ENV=test, file-load fails loudly so silent fallthrough
// (e.g. real Redis writes from a future cacheSetSafe call site) can't
// occur.
expect(process.env.NODE_ENV).toBe('test');

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: vi.fn(async () => null),
  cacheSetSafe: vi.fn(async () => undefined),
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
    decr: vi.fn(),
    del: vi.fn(),
    expire: vi.fn(),
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

// Dynamic import — mocks must be registered first.
const { probeUrl, classifySoft404 } = await import('../../lib/urlLiveness.js');

function makeResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Phase 32 Plan 02 Task 1 — probeUrl', () => {
  describe('terminal-2xx and explicit-4xx taxonomy (D-07)', () => {
    it('HEAD 200 → status:live, httpStatus:200', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(200));
      const result = await probeUrl('https://example.com/article');
      expect(result.status).toBe('live');
      expect(result.httpStatus).toBe(200);
      expect(result.finalUrl).toBe('https://example.com/article');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('HEAD 404 → status:"404"', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(404));
      const result = await probeUrl('https://example.com/missing');
      expect(result.status).toBe('404');
      expect(result.httpStatus).toBe(404);
    });

    it('HEAD 403 → status:"403"', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(403));
      const result = await probeUrl('https://example.com/forbidden');
      expect(result.status).toBe('403');
      expect(result.httpStatus).toBe(403);
    });

    it('HEAD 405 → GET with Range fallback, then 200 → status:live (D-16)', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(405)).mockResolvedValueOnce(makeResponse(200));
      const result = await probeUrl('https://cdn.example.com/article');
      expect(result.status).toBe('live');
      expect(result.httpStatus).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // Assert the GET fallback carried the Range header.
      const getCall = fetchMock.mock.calls[1];
      expect(getCall?.[1]?.method).toBe('GET');
      expect(getCall?.[1]?.headers?.Range).toBe('bytes=0-1023');
    });

    it('5xx / unmapped 4xx (e.g. 451) → status:unknown', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(503));
      const result = await probeUrl('https://example.com/down');
      expect(result.status).toBe('unknown');
      expect(result.httpStatus).toBe(503);
    });
  });

  describe('redirect handling (D-17)', () => {
    it('3xx chain length ≤3 with terminal 200 → status:live', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse(301, { location: 'https://b.example.com/' }))
        .mockResolvedValueOnce(makeResponse(302, { location: 'https://c.example.com/' }))
        .mockResolvedValueOnce(makeResponse(200));
      const result = await probeUrl('https://a.example.com/');
      expect(result.status).toBe('live');
      expect(result.httpStatus).toBe(200);
      expect(result.finalUrl).toBe('https://c.example.com/');
      expect(fetchMock).toHaveBeenCalledTimes(3);
      // Every fetch must carry `redirect: 'manual'` so the count is honest.
      for (const call of fetchMock.mock.calls) {
        expect(call[1]?.redirect).toBe('manual');
      }
    });

    it('3xx chain that hits 4th 3xx → status:unknown', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse(301, { location: 'https://b.example.com/' }))
        .mockResolvedValueOnce(makeResponse(301, { location: 'https://c.example.com/' }))
        .mockResolvedValueOnce(makeResponse(301, { location: 'https://d.example.com/' }))
        .mockResolvedValueOnce(makeResponse(301, { location: 'https://e.example.com/' }));
      const result = await probeUrl('https://a.example.com/');
      expect(result.status).toBe('unknown');
      // 3 follows + 1 evaluation at hop=3 = 4 calls total.
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  describe('failure modes', () => {
    it('fetch throws (DNS/ECONNREFUSED) → status:dead-host, httpStatus:null', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed: ENOTFOUND'));
      const result = await probeUrl('https://no-such-host.invalid/');
      expect(result.status).toBe('dead-host');
      expect(result.httpStatus).toBe(null);
    });

    it('AbortController timeout (fake timers) → status:dead-host', async () => {
      vi.useFakeTimers();
      // Mock fetch as a hang that rejects via AbortError when the controller fires.
      fetchMock.mockImplementationOnce((_url, init) => {
        return new Promise<Response>((_, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }
        });
      });
      const promise = probeUrl('https://slow.example.com/');
      // Advance past PROBE_TIMEOUT_MS = 10_000.
      await vi.advanceTimersByTimeAsync(11_000);
      const result = await promise;
      expect(result.status).toBe('dead-host');
      expect(result.httpStatus).toBe(null);
    });
  });

  describe('polite-citizen headers (D-21)', () => {
    it('every fetch carries the exact PROBE_UA User-Agent', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(200));
      await probeUrl('https://example.com/');
      const call = fetchMock.mock.calls[0];
      expect(call?.[1]?.headers?.['User-Agent']).toBe(
        'IranMonitor-LinkCheck/1.0 (+https://otg-iran-monitor.vercel.app)',
      );
    });
  });

  describe('SSRF guard (defense-in-depth)', () => {
    it('localhost target → status:unknown WITHOUT calling fetch', async () => {
      const result = await probeUrl('http://localhost:6379/secret');
      expect(result.status).toBe('unknown');
      expect(result.httpStatus).toBe(null);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('RFC1918 private host (10.x) → status:unknown WITHOUT calling fetch', async () => {
      const result = await probeUrl('http://10.0.0.1/admin');
      expect(result.status).toBe('unknown');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('link-local AWS metadata (169.254.x) → status:unknown WITHOUT calling fetch', async () => {
      const result = await probeUrl('http://169.254.169.254/latest/meta-data/');
      expect(result.status).toBe('unknown');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // CR-02 regression — URL.hostname returns IPv6 with surrounding brackets
    // (e.g. '[::1]'). The previous regex anchored at `^` against literal
    // '::1' / 'fc' / 'fd' and never matched the leading '[', leaving the
    // probe open to fetches against IPv6 loopback / link-local / ULA hosts.
    it('CR-02 — IPv6 loopback http://[::1]/ → status:unknown WITHOUT calling fetch', async () => {
      const result = await probeUrl('http://[::1]:6379/secret');
      expect(result.status).toBe('unknown');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('CR-02 — IPv6 ULA http://[fd00::1]/ → status:unknown WITHOUT calling fetch', async () => {
      const result = await probeUrl('http://[fd00::1]/admin');
      expect(result.status).toBe('unknown');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('CR-02 — IPv6 link-local http://[fe80::1]/ → status:unknown WITHOUT calling fetch', async () => {
      const result = await probeUrl('http://[fe80::1]/admin');
      expect(result.status).toBe('unknown');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('CR-02 — IPv4-mapped-IPv6 http://[::ffff:127.0.0.1]/ → status:unknown WITHOUT calling fetch', async () => {
      const result = await probeUrl('http://[::ffff:127.0.0.1]/admin');
      expect(result.status).toBe('unknown');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('CR-02 — IPv6 unspecified http://[::]/ → status:unknown WITHOUT calling fetch', async () => {
      const result = await probeUrl('http://[::]/admin');
      expect(result.status).toBe('unknown');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // CR-02 negative test — legitimate hostnames containing 'fc'/'fd' prefixes
    // (e.g. 'fc-barcelona.com', 'fdcompany.com') must NOT be false-positive-blocked
    // now that ULA detection requires the `[0-9a-f]{2}:` hex disambiguation.
    it('CR-02 — legitimate hostname "fc-barcelona.com" is NOT blocked by SSRF guard', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(200));
      const result = await probeUrl('https://fc-barcelona.com/players');
      expect(result.status).toBe('live');
      expect(fetchMock).toHaveBeenCalled();
    });

    it('CR-02 — legitimate hostname "fdcompany.com" is NOT blocked by SSRF guard', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(200));
      const result = await probeUrl('https://fdcompany.com/about');
      expect(result.status).toBe('live');
      expect(fetchMock).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Phase 43 Plan 02 Task 1 — classifySoft404 pure heuristic (GHOST-06)
// ============================================================================
//
// Table-driven test for the pure soft-404 body heuristic. No fetch mock — the
// function takes (bodyText, finalUrl, originalUrl) and returns a verdict.
// Covers all three D-02 signals in order, the D-03 precision-first tie-break,
// and the D-02 signal-order precedence (markers win over near-empty).

describe('Phase 43 Plan 02 Task 1 — classifySoft404 (GHOST-06)', () => {
  const DEEP = 'https://x.com/news/article-123';

  describe('(a) not-found markers in <title> — D-02a, case-insensitive', () => {
    const markerCases: Array<{ name: string; title: string; marker: string }> = [
      { name: 'lowercase "page not found"', title: 'Page not found', marker: 'page not found' },
      { name: 'mixed-case "Page Not Found"', title: 'Page Not Found', marker: 'page not found' },
      { name: 'numeric "404"', title: 'Error 404 — Oops', marker: '404' },
      {
        name: '"article not available"',
        title: 'This article not available',
        marker: 'article not available',
      },
      {
        name: '"no longer exists"',
        title: 'The page no longer exists',
        marker: 'no longer exists',
      },
    ];

    for (const { name, title, marker } of markerCases) {
      it(`title containing ${name} → soft404:true with verbatim D-16 evidence`, () => {
        const body = `<html><head><title>${title}</title></head><body>x</body></html>`;
        // Deep→deep URLs so ONLY the marker signal can fire.
        const result = classifySoft404(body, DEEP, DEEP);
        expect(result.soft404).toBe(true);
        expect(result.evidence).toBe(`soft-404: matched "${marker}" in title`);
      });
    }

    it('marker present only in BODY text (not title) does NOT fire (precision — articles about 404s)', () => {
      // A legitimate article ABOUT 404 errors; title is benign, body mentions "404".
      const body =
        '<html><head><title>How HTTP status codes work</title></head>' +
        '<body>' +
        'A 404 means page not found. '.repeat(40) +
        '</body></html>';
      const result = classifySoft404(body, DEEP, DEEP);
      expect(result.soft404).toBe(false);
      expect(result.evidence).toBeNull();
    });
  });

  describe('(b) redirect-to-home — D-02b (deep→shallow only)', () => {
    it('deep article → homepage root "/" → soft404:true with D-16 evidence', () => {
      const body =
        '<html><head><title>Home</title></head><body>' + 'x'.repeat(2000) + '</body></html>';
      const result = classifySoft404(body, 'https://x.com/', 'https://x.com/news/article-123');
      expect(result.soft404).toBe(true);
      expect(result.evidence).toBe('redirect-to-home: /news/article-123 → /');
    });

    it('deep article → single-segment section root → soft404:true', () => {
      const body =
        '<html><head><title>News</title></head><body>' + 'x'.repeat(2000) + '</body></html>';
      const result = classifySoft404(body, 'https://x.com/news', 'https://x.com/news/article-123');
      expect(result.soft404).toBe(true);
      expect(result.evidence).toBe('redirect-to-home: /news/article-123 → /news');
    });

    it('deep → deep canonical move is NOT redirect-to-home (final depth > 1)', () => {
      const body =
        '<html><head><title>Article</title></head><body>' + 'x'.repeat(2000) + '</body></html>';
      const result = classifySoft404(
        body,
        'https://x.com/news/2026/article-123-final',
        'https://x.com/news/article-123',
      );
      expect(result.soft404).toBe(false);
      expect(result.evidence).toBeNull();
    });

    it('shallow original → shallow final does NOT fire (orig depth < 2)', () => {
      const body =
        '<html><head><title>Section</title></head><body>' + 'x'.repeat(2000) + '</body></html>';
      const result = classifySoft404(body, 'https://x.com/', 'https://x.com/news');
      expect(result.soft404).toBe(false);
      expect(result.evidence).toBeNull();
    });
  });

  describe('(c) near-empty content — D-02c (stripped-of-tags floor)', () => {
    it('body whose stripped content is below the floor → soft404:true with byte-count evidence', () => {
      // Markup with almost no text content after tag-stripping.
      const body =
        '<html><head><title>Article</title></head><body><div id="root"></div></body></html>';
      const result = classifySoft404(body, DEEP, DEEP);
      expect(result.soft404).toBe(true);
      // Evidence format: "near-empty: <n> bytes" with the stripped content length.
      expect(result.evidence).toMatch(/^near-empty: \d+ bytes$/);
    });

    it('normal article body (above floor, no markers, deep→deep) → soft404:false', () => {
      const body =
        '<html><head><title>A real news article</title></head><body><article>' +
        'The situation on the ground continued to develop today. '.repeat(40) +
        '</article></body></html>';
      const result = classifySoft404(body, DEEP, DEEP);
      expect(result.soft404).toBe(false);
      expect(result.evidence).toBeNull();
    });
  });

  describe('precision-first tie-break (D-03) + signal order (D-02)', () => {
    it('no signal fires → soft404:false, evidence:null (NEVER flag live)', () => {
      const body =
        '<html><head><title>Breaking news from the region</title></head><body><article>' +
        'Detailed reporting with substantial content goes here. '.repeat(50) +
        '</article></body></html>';
      const result = classifySoft404(body, DEEP, DEEP);
      expect(result.soft404).toBe(false);
      expect(result.evidence).toBeNull();
    });

    it('body that is BOTH near-empty AND has a title marker returns MARKER evidence (markers first per D-02)', () => {
      // Near-empty body whose title also carries a not-found marker. Markers
      // evaluated first → evidence must be the marker, not "near-empty".
      const body = '<html><head><title>Page not found</title></head><body></body></html>';
      const result = classifySoft404(body, DEEP, DEEP);
      expect(result.soft404).toBe(true);
      expect(result.evidence).toBe('soft-404: matched "page not found" in title');
    });
  });
});
