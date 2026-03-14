/**
 * Mock for maplibre-gl in jsdom tests.
 * Provides stub classes so imports resolve without WebGL.
 */

class MockMap {
  _listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  _layers: Record<string, Record<string, unknown>> = {};

  on(event: string, listener: (...args: unknown[]) => void) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
    return this;
  }

  off(event: string, listener: (...args: unknown[]) => void) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter((l) => l !== listener);
    }
    return this;
  }

  getLayer(id: string) {
    return this._layers[id] ?? undefined;
  }

  setLayoutProperty(_layerId: string, _name: string, _value: unknown) {
    return this;
  }

  setPaintProperty(_layerId: string, _name: string, _value: unknown) {
    return this;
  }

  flyTo(_options: Record<string, unknown>) {
    return this;
  }

  remove() {
    /* noop */
  }

  getCanvas() {
    return document.createElement('canvas');
  }
}

class MockNavigationControl {
  /* noop */
}

class MockScaleControl {
  /* noop */
}

class MockMarker {
  setLngLat() {
    return this;
  }
  addTo() {
    return this;
  }
  remove() {
    return this;
  }
}

export const Map = MockMap;
export const NavigationControl = MockNavigationControl;
export const ScaleControl = MockScaleControl;
export const Marker = MockMarker;

const maplibregl = {
  Map: MockMap,
  NavigationControl: MockNavigationControl,
  ScaleControl: MockScaleControl,
  Marker: MockMarker,
};

export default maplibregl;
