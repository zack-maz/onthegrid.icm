/**
 * Wave-0 RED stub — REVEAL-SITE-01 / REVEAL-SITE-02 uiStore reveal slice.
 *
 * Pins the contract for the new uiStore members that Plan 06 implements:
 *   isIntroSeen / setIntroSeen / isTourOpen / openTour / closeTour
 *
 * These assertions FAIL until Plan 06 adds the slice (the members are
 * `undefined` on the current store), and go GREEN when the implementation
 * lands. Do NOT mark `it.todo` — real failing assertions are the red state.
 *
 * Mirrors the existing localStorage-stub idiom in `src/__tests__/uiStore.test.ts`
 * and the persisted `markets-collapsed` pattern (the intro flag copies it).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage for test isolation (mirrors uiStore.test.ts)
const storageMock: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => storageMock[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storageMock[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete storageMock[key];
  }),
};

vi.stubGlobal('localStorage', localStorageMock);

// Import after stubbing localStorage
import { useUIStore } from '@/stores/uiStore';

const INTRO_KEY = 'iran-monitor.intro-seen';

function clearStorage() {
  for (const key of Object.keys(storageMock)) {
    delete storageMock[key];
  }
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
}

describe('uiStore reveal slice (REVEAL-SITE-01 / 02)', () => {
  beforeEach(() => {
    clearStorage();
  });

  it('exposes the 5 reveal members (isIntroSeen / isTourOpen / setIntroSeen / openTour / closeTour)', () => {
    const s = useUIStore.getState();
    expect(typeof s.isIntroSeen).toBe('boolean');
    expect(typeof s.isTourOpen).toBe('boolean');
    expect(typeof s.setIntroSeen).toBe('function');
    expect(typeof s.openTour).toBe('function');
    expect(typeof s.closeTour).toBe('function');
  });

  it('openTour() / closeTour() toggle isTourOpen (session-scoped, re-openable)', () => {
    useUIStore.getState().closeTour();
    expect(useUIStore.getState().isTourOpen).toBe(false);
    useUIStore.getState().openTour();
    expect(useUIStore.getState().isTourOpen).toBe(true);
    // re-openable after a close (D-03)
    useUIStore.getState().closeTour();
    expect(useUIStore.getState().isTourOpen).toBe(false);
    useUIStore.getState().openTour();
    expect(useUIStore.getState().isTourOpen).toBe(true);
  });

  it('setIntroSeen(true) sets isIntroSeen AND writes iran-monitor.intro-seen=true to localStorage', () => {
    useUIStore.getState().setIntroSeen(true);
    expect(useUIStore.getState().isIntroSeen).toBe(true);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(INTRO_KEY, 'true');
    expect(storageMock[INTRO_KEY]).toBe('true');
  });

  it('the intro-seen flag survives store re-init (read back via readBool from localStorage)', async () => {
    // Persist the flag, then re-import the store module fresh to simulate re-init.
    storageMock[INTRO_KEY] = 'true';
    vi.resetModules();
    const { useUIStore: freshStore } = await import('@/stores/uiStore');
    expect(freshStore.getState().isIntroSeen).toBe(true);
  });
});
