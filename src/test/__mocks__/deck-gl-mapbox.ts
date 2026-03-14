/**
 * Mock for @deck.gl/mapbox in jsdom tests.
 * Provides stub MapboxOverlay so deck.gl tests run without WebGL.
 */

export class MapboxOverlay {
  _props: Record<string, unknown> = {};

  constructor(props?: Record<string, unknown>) {
    if (props) this._props = props;
  }

  setProps(props: Record<string, unknown>) {
    this._props = { ...this._props, ...props };
  }
}

export type MapboxOverlayProps = Record<string, unknown>;
