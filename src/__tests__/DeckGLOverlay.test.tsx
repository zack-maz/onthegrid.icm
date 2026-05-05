/* eslint-disable import/order -- vi.mock and post-mock value imports are
 * intentionally interleaved for test-mock boundary clarity. vitest hoists
 * vi.mock to the top regardless of source position, so the deferred imports
 * below still see the mock. */
import { MapboxOverlay } from '@deck.gl/mapbox';
import { vi } from 'vitest';

// Mock useControl from react-maplibre
const mockSetProps = vi.fn();
const mockOverlayInstance = { setProps: mockSetProps };

vi.mock('@vis.gl/react-maplibre', () => ({
  useControl: vi.fn((factory: () => unknown) => {
    factory(); // invoke the factory to verify MapboxOverlay is constructed
    return mockOverlayInstance;
  }),
}));

import { render } from '@testing-library/react';
import { useControl } from '@vis.gl/react-maplibre';

import { DeckGLOverlay } from '@/components/map/DeckGLOverlay';
/* eslint-enable import/order */

describe('DeckGLOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls useControl with MapboxOverlay constructor and sets props', () => {
    const testProps = { layers: [], interleaved: false };
    const { container } = render(<DeckGLOverlay {...testProps} />);

    // useControl should have been called
    expect(useControl).toHaveBeenCalled();

    // The factory passed to useControl should create a MapboxOverlay
    const factory = vi.mocked(useControl).mock.calls[0][0];
    const result = factory({} as never);
    expect(result).toBeInstanceOf(MapboxOverlay);

    // setProps should be called with the component props
    expect(mockSetProps).toHaveBeenCalledWith(testProps);

    // Component returns null (renders nothing)
    expect(container.innerHTML).toBe('');
  });
});
