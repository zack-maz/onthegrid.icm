/**
 * MapLoadingScreen component tests
 * Covers MAP-01f (loading screen fade behavior)
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MapLoadingScreen } from '@/components/map/MapLoadingScreen';

describe('MapLoadingScreen', () => {
  it('shows loading when isLoaded is false (MAP-01f)', () => {
    const { container } = render(<MapLoadingScreen isLoaded={false} />);
    const overlay = container.firstElementChild!;
    expect(overlay.classList.contains('opacity-100')).toBe(true);
    expect(overlay.classList.contains('pointer-events-none')).toBe(false);
  });

  it('fades out when isLoaded is true (MAP-01f)', () => {
    const { container } = render(<MapLoadingScreen isLoaded={true} />);
    const overlay = container.firstElementChild!;
    expect(overlay.classList.contains('opacity-0')).toBe(true);
    expect(overlay.classList.contains('pointer-events-none')).toBe(true);
  });
});
