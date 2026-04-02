import { LayerExtension } from '@deck.gl/core';

/**
 * deck.gl LayerExtension that applies a radial alpha falloff to ScatterplotLayer circles.
 * Uses GLSL fragment shader injection via `fs:DECKGL_FILTER_COLOR` to compute
 * distance from center (geometry.uv) and apply a smooth hermite falloff curve.
 *
 * Result: full opacity at circle center, fading to transparent at edge.
 */
export class RadialGradientExtension extends LayerExtension {
  static extensionName = 'RadialGradientExtension';

  getShaders() {
    return {
      inject: {
        'fs:DECKGL_FILTER_COLOR': `
          float dist = length(geometry.uv);
          float falloff = 1.0 - smoothstep(0.0, 1.0, dist);
          color.a *= falloff;
        `,
      },
    };
  }
}
