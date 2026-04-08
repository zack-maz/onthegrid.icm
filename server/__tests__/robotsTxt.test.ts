// @vitest-environment node
/**
 * Tests for `public/robots.txt`.
 *
 * Vite serves files from `public/` at the web root in dev and production
 * builds, so `public/robots.txt` is published at `/robots.txt`. Its job is
 * to tell well-behaved crawlers (Googlebot, Bingbot, etc.) not to index the
 * upstream-API-backed routes so we don't burn Redis budget on search
 * engine hits after the portfolio demo URL is published.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const robotsPath = resolve(process.cwd(), 'public/robots.txt');

describe('public/robots.txt — live demo scraper protection', () => {
  it('exists at public/robots.txt', () => {
    expect(existsSync(robotsPath)).toBe(true);
  });

  it('has a User-agent: * directive', () => {
    const contents = readFileSync(robotsPath, 'utf-8');
    expect(contents).toMatch(/^User-agent:\s*\*/m);
  });

  it('disallows /api/ paths so crawlers do not hit upstream APIs', () => {
    const contents = readFileSync(robotsPath, 'utf-8');
    expect(contents).toMatch(/^Disallow:\s*\/api\//m);
  });

  it('disallows /health so uptime probes from indexers never touch it', () => {
    const contents = readFileSync(robotsPath, 'utf-8');
    expect(contents).toMatch(/^Disallow:\s*\/health/m);
  });

  it('explicitly allows the SPA root /', () => {
    const contents = readFileSync(robotsPath, 'utf-8');
    expect(contents).toMatch(/^Allow:\s*\//m);
  });
});
