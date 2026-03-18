/**
 * Mock for @deck.gl/mapbox in jsdom tests.
 * Provides stub MapboxOverlay so deck.gl tests run without WebGL.
 * Captures onHover/onClick props for test access.
 */

export let __lastOverlayProps: Record<string, unknown> = {};

export class MapboxOverlay {
  _props: Record<string, unknown> = {};

  constructor(props?: Record<string, unknown>) {
    if (props) this._props = props;
  }

  setProps(props: Record<string, unknown>) {
    this._props = { ...this._props, ...props };
    __lastOverlayProps = this._props;
  }
}

export type MapboxOverlayProps = Record<string, unknown>;
