/**
 * Mock for @deck.gl/layers in jsdom tests.
 * Captures constructor props so tests can inspect layer configuration without WebGL.
 */

export class IconLayer {
  id: string;
  props: Record<string, unknown>;

  constructor(props: Record<string, unknown> = {}) {
    this.id = (props.id as string) ?? '';
    this.props = { ...props };
  }
}

export class ScatterplotLayer {
  id: string;
  props: Record<string, unknown>;

  constructor(props: Record<string, unknown> = {}) {
    this.id = (props.id as string) ?? '';
    this.props = { ...props };
  }
}

export class GeoJsonLayer {
  id: string;
  props: Record<string, unknown>;

  constructor(props: Record<string, unknown> = {}) {
    this.id = (props.id as string) ?? '';
    this.props = { ...props };
  }
}

export class TextLayer {
  id: string;
  props: Record<string, unknown>;

  constructor(props: Record<string, unknown> = {}) {
    this.id = (props.id as string) ?? '';
    this.props = { ...props };
  }
}
