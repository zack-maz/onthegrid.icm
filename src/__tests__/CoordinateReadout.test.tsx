/**
 * CoordinateReadout component tests
 * Covers MAP-01e (displays formatted coordinates from store)
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoordinateReadout } from '@/components/map/CoordinateReadout';

// Mock mapStore to return specific cursor coordinates
vi.mock('@/stores/mapStore', () => ({
  useMapStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) => {
    const state = {
      cursorLng: 53.7,
      cursorLat: 32.4,
    };
    return selector(state);
  }),
}));

describe('CoordinateReadout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays formatted coordinates from store (MAP-01e)', () => {
    render(<CoordinateReadout />);
    const text = screen.getByText(/32\.4000/);
    expect(text).toBeTruthy();
    expect(text.textContent).toContain('53.7000');
    expect(text.textContent).toContain('N');
    expect(text.textContent).toContain('E');
  });
});
