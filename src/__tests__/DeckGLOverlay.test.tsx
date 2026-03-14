import { vi } from 'vitest';
import { MapboxOverlay } from '@deck.gl/mapbox';

// Mock useControl from react-maplibre
const mockSetProps = vi.fn();
const mockOverlayInstance = { setProps: mockSetProps };

vi.mock('@vis.gl/react-maplibre', () => ({
  useControl: vi.fn((factory: () => unknown) => {
    factory(); // invoke the factory to verify MapboxOverlay is constructed
    return mockOverlayInstance;
  }),
}));

import { DeckGLOverlay } from '@/components/map/DeckGLOverlay';
import { useControl } from '@vis.gl/react-maplibre';
import { render } from '@testing-library/react';

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
