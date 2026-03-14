import { useMapStore } from '@/stores/mapStore';

describe('mapStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useMapStore.setState({
      isMapLoaded: false,
      cursorLng: 0,
      cursorLat: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useMapStore.getState();
    expect(state.isMapLoaded).toBe(false);
    expect(state.cursorLng).toBe(0);
    expect(state.cursorLat).toBe(0);
  });

  it('setMapLoaded sets isMapLoaded to true', () => {
    useMapStore.getState().setMapLoaded();
    expect(useMapStore.getState().isMapLoaded).toBe(true);
  });

  it('setCursorPosition updates cursorLng and cursorLat', () => {
    useMapStore.getState().setCursorPosition(51.3, 35.7);
    const state = useMapStore.getState();
    expect(state.cursorLng).toBe(51.3);
    expect(state.cursorLat).toBe(35.7);
  });
});
