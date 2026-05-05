/**
 * Phase 28.2 Plan 04 Task 4 — NotificationCard severity score lockdown.
 *
 * D-07 lockdown: NotificationCard severity score numeric is dev-only
 * forever per memory `project_dev_score_display.md`. The score must
 * NEVER appear in any prod build (with or without a Bearer token).
 *
 * The test is a regression guard, not a current-bug catch:
 *   1. NotificationCard.tsx as of 2026-05-05 does not render any
 *      numeric severity score (the `Notification` interface in
 *      notificationStore.ts has no `score` field). The dev-only
 *      block was historically gated by `import.meta.env.DEV`.
 *   2. If a future agent adds a `score` field back to the
 *      `Notification` type AND search-and-replaces
 *      `import.meta.env.DEV` → `shouldRenderDashboard()` across the
 *      file (the same drift mechanic guarded against in Plan 04
 *      Task 3 Test 4), the score numeric would silently graduate
 *      to Bearer-gated prod, violating D-07.
 *
 * Lockdown contract enforced here:
 *   - Static-source check: `NotificationCard.tsx` must NOT import
 *     `shouldRenderDashboard` from `@/lib/dashboardAuth`. The
 *     import alone signals graduation intent. (Symmetric pattern to
 *     `HealthBanner.test.tsx` Test 8 which forbids
 *     `useHealthStatus(` to prevent the double-poll regression.)
 *   - Render-time check: even with a `score` field present on the
 *     notification AND `shouldRenderDashboard()` returning true AND
 *     `import.meta.env.DEV` set to false, no numeric score string
 *     appears in the rendered output.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { NotificationCard } from '@/components/notifications/NotificationCard';
import * as DashboardAuth from '@/lib/dashboardAuth';
import type { Notification } from '@/stores/notificationStore';

vi.mock('@/lib/dashboardAuth', async () => {
  const actual = await vi.importActual<typeof DashboardAuth>('@/lib/dashboardAuth');
  return {
    ...actual,
    shouldRenderDashboard: vi.fn(() => true),
  };
});

// A notification value that includes a hypothetical `score` field. Cast
// through unknown so this still compiles even though the production
// Notification type does NOT carry a score field (D-07 lockdown is
// the canonical reason — re-adding the field is a separate decision).
const mockNotificationWithScore: Notification = {
  id: 'notif-test-1',
  title: 'Test airstrike notification',
  url: 'https://example.com/article',
  source: 'GDELT',
  sourceCount: 4,
  articleCount: 6,
  keywords: ['airstrike', 'test'],
  timestamp: Date.now(),
  lastUpdated: Date.now(),
  // The hypothetical score that future drift might re-introduce:
  score: 8.5,
} as unknown as Notification;

describe('NotificationCard — severity score lockdown (D-07, UI-SPEC §1)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReset();
  });

  it('Source-level guard: NotificationCard.tsx does NOT import shouldRenderDashboard', () => {
    // The `shouldRenderDashboard` import is the load-bearing signal of
    // Bearer-gating intent. If a future commit adds it to
    // NotificationCard.tsx, the score numeric is one search-and-replace
    // away from graduating — violating D-07. Forbid the import outright.
    const sourcePath = resolve(__dirname, '../NotificationCard.tsx');
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).not.toMatch(/from\s+['"]@\/lib\/dashboardAuth['"]/);
    expect(source).not.toContain('shouldRenderDashboard');
  });

  it('Render-time guard: severity score numeric is NEVER rendered in Bearer-prod', () => {
    // Even with shouldRenderDashboard()=true and DEV=false, no numeric
    // severity score appears. If a future regression adds a
    // `{shouldRenderDashboard() && <span>{notification.score}</span>}`
    // block, this test fails (the "8.5" or any decimal string surfaces).
    vi.stubEnv('DEV', false);
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(true);
    render(<NotificationCard notification={mockNotificationWithScore} />);

    // The literal string "8.5" must not appear anywhere in the rendered
    // tree. Use queryByText with an exact-match regex to avoid matching
    // unrelated decimals.
    expect(screen.queryByText(/^8\.5$/)).toBeNull();
    expect(screen.queryByText(/^8\.500$/)).toBeNull();

    // Also assert no element with a `data-testid` ending in "-score"
    // — a common pattern for dev-only score display.
    const card = screen.getByTestId('notification-card-notif-test-1');
    expect(card.querySelector('[data-testid$="-score"]')).toBeNull();
  });
});
