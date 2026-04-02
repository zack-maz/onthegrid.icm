import { create } from 'zustand';

interface MapState {
  isMapLoaded: boolean;
  cursorLng: number;
  cursorLat: number;
  /** True when map zoom is below 9 (regional view). Used for layer z-order crossover. */
  isBelowZoom9: boolean;
  setMapLoaded: () => void;
  setCursorPosition: (lng: number, lat: number) => void;
  /** Update zoom region boolean. Only triggers re-render when crossing the zoom-9 threshold. */
  setZoomRegion: (zoom: number) => void;
}

export const useMapStore = create<MapState>()((set) => ({
  isMapLoaded: false,
  cursorLng: 0,
  cursorLat: 0,
  isBelowZoom9: true,
  setMapLoaded: () => set({ isMapLoaded: true }),
  setCursorPosition: (lng, lat) => set({ cursorLng: lng, cursorLat: lat }),
  setZoomRegion: (zoom) => set({ isBelowZoom9: zoom < 9 }),
}));
