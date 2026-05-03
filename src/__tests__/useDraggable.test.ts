import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// `@/` alias is internal — the rule's resolver treats it as external without
// a TypeScript path resolver, but separating it here documents intent.
// eslint-disable-next-line import/order
import { clampPosition } from '@/hooks/useDraggable';

// Mock localStorage using project pattern
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, val: string) => {
    store[key] = val;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
};
vi.stubGlobal('localStorage', localStorageMock);

// Import after stubbing
import { useDraggable } from '@/hooks/useDraggable';

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
  const defaultPos = { x: 500, y: 56 };
  const storageKey = 'test-drag-pos';

  beforeEach(() => {
    // Clear store and reset mocks
    for (const key of Object.keys(store)) delete store[key];
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
  });

  it('returns defaultPosition when localStorage is empty', () => {
    const { result } = renderHook(() => useDraggable({ storageKey, defaultPosition: defaultPos }));
    expect(result.current.position).toEqual(defaultPos);
  });

  it('returns stored position from localStorage', () => {
    store[storageKey] = JSON.stringify({ x: 200, y: 300 });

    const { result } = renderHook(() => useDraggable({ storageKey, defaultPosition: defaultPos }));
    expect(result.current.position).toEqual({ x: 200, y: 300 });
  });

  it('resetPosition sets position to defaultPosition and clears localStorage', () => {
    store[storageKey] = JSON.stringify({ x: 200, y: 300 });

    const { result } = renderHook(() => useDraggable({ storageKey, defaultPosition: defaultPos }));

    act(() => {
      result.current.resetPosition();
    });

    expect(result.current.position).toEqual(defaultPos);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(storageKey);
    expect(store[storageKey]).toBeUndefined();
  });

  it('isDragging is false initially', () => {
    const { result } = renderHook(() => useDraggable({ storageKey, defaultPosition: defaultPos }));
    expect(result.current.isDragging).toBe(false);
  });

  it('handleProps has correct style with grab cursor', () => {
    const { result } = renderHook(() => useDraggable({ storageKey, defaultPosition: defaultPos }));
    expect(result.current.handleProps.style.touchAction).toBe('none');
    expect(result.current.handleProps.style.cursor).toBe('grab');
  });

  it('returns handleProps with pointer event handlers', () => {
    const { result } = renderHook(() => useDraggable({ storageKey, defaultPosition: defaultPos }));
    expect(typeof result.current.handleProps.onPointerDown).toBe('function');
    expect(typeof result.current.handleProps.onPointerMove).toBe('function');
    expect(typeof result.current.handleProps.onPointerUp).toBe('function');
  });
});
