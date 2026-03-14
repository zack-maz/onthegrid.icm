export const INITIAL_VIEW_STATE = {
  longitude: 53.7,
  latitude: 32.4,
  zoom: 5.5,
  pitch: 35,
  bearing: 0,
};

export const MAX_BOUNDS: [number, number, number, number] = [30, 15, 70, 45]; // [west, south, east, north]

export const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const TERRAIN_SOURCE_TILES = [
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
];
export const TERRAIN_ENCODING = 'terrarium' as const;

export const TERRAIN_CONFIG = { source: 'terrain-dem', exaggeration: 1.5 };

// CARTO Dark Matter layer IDs for style customization
export const ROAD_LABEL_LAYERS = [
  'roadname_minor',
  'roadname_sec',
  'roadname_pri',
  'roadname_major',
];

export const BORDER_LAYERS = [
  'boundary_country_outline',
  'boundary_country_inner',
];

export const WATER_LAYERS = ['water', 'water_shadow', 'waterway'];

export const MINOR_FEATURE_LAYERS = ['place_suburbs', 'place_hamlet', 'poi'];
