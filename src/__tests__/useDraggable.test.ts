import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { clampPosition } from '@/hooks/useDraggable';

// Mock localStorage
let storage: Record<string, string> = {};

beforeEach(() => {
  storage = {};
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => storage[key] ?? null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => { storage[key] = value; });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => { delete storage[key]; });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clampPosition', () => {
  const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };

  it('returns position unchanged when within bounds', () => {
    expect(clampPosition({ x: 100, y: 200 }, bounds)).toEqual({ x: 100, y: 200 });
  });

  it('clamps x below minX', () => {
    expect(clampPosition({ x: -50, y: 200 }, bounds)).toEqual({ x: 0, y: 200 });
  });

  it('clamps x above maxX', () => {
    expect(clampPosition({ x: 1200, y: 200 }, bounds)).toEqual({ x: 1000, y: 200 });
  });

  it('clamps y below minY', () => {
    expect(clampPosition({ x: 100, y: -30 }, bounds)).toEqual({ x: 100, y: 0 });
  });

  it('clamps y above maxY', () => {
    expect(clampPosition({ x: 100, y: 900 }, bounds)).toEqual({ x: 100, y: 800 });
  });

  it('clamps both axes simultaneously', () => {
    expect(clampPosition({ x: -10, y: 1200 }, bounds)).toEqual({ x: 0, y: 800 });
  });
});

describe('useDraggable', () => {
  // Dynamically import to allow mocks to take effect
  async function importHook() {
    const mod = await import('@/hooks/useDraggable');
    return mod.useDraggable;
  }

  const defaultPos = { x: 500, y: 56 };
  const storageKey = 'test-drag-pos';

  it('returns defaultPosition when localStorage is empty', async () => {
    const useDraggable = await importHook();
    const { result } = renderHook(() =>
      useDraggable({ storageKey, defaultPosition: defaultPos })
    );
    expect(result.current.position).toEqual(defaultPos);
  });

  it('returns stored position from localStorage', async () => {
    const saved = { x: 200, y: 300 };
    storage[storageKey] = JSON.stringify(saved);

    const useDraggable = await importHook();
    const { result } = renderHook(() =>
      useDraggable({ storageKey, defaultPosition: defaultPos })
    );
    expect(result.current.position).toEqual(saved);
  });

  it('resetPosition sets position to defaultPosition and clears localStorage', async () => {
    storage[storageKey] = JSON.stringify({ x: 200, y: 300 });

    const useDraggable = await importHook();
    const { result } = renderHook(() =>
      useDraggable({ storageKey, defaultPosition: defaultPos })
    );

    act(() => {
      result.current.resetPosition();
    });

    expect(result.current.position).toEqual(defaultPos);
    expect(storage[storageKey]).toBeUndefined();
  });

  it('isDragging is false initially', async () => {
    const useDraggable = await importHook();
    const { result } = renderHook(() =>
      useDraggable({ storageKey, defaultPosition: defaultPos })
    );
    expect(result.current.isDragging).toBe(false);
  });

  it('handleProps has correct style with grab cursor', async () => {
    const useDraggable = await importHook();
    const { result } = renderHook(() =>
      useDraggable({ storageKey, defaultPosition: defaultPos })
    );
    expect(result.current.handleProps.style.touchAction).toBe('none');
    expect(result.current.handleProps.style.cursor).toBe('grab');
  });

  it('returns handleProps with pointer event handlers', async () => {
    const useDraggable = await importHook();
    const { result } = renderHook(() =>
      useDraggable({ storageKey, defaultPosition: defaultPos })
    );
    expect(typeof result.current.handleProps.onPointerDown).toBe('function');
    expect(typeof result.current.handleProps.onPointerMove).toBe('function');
    expect(typeof result.current.handleProps.onPointerUp).toBe('function');
  });
});
