import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { useWeatherLayers, WeatherTooltip } from '@/components/map/layers/WeatherOverlay';
import { useWeatherStore } from '@/stores/weatherStore';
import { useLayerStore } from '@/stores/layerStore';
import { LEGEND_REGISTRY } from '@/components/map/MapLegend';
import type { WeatherGridPoint } from '@/stores/weatherStore';

const mockGrid: WeatherGridPoint[] = [
  { lat: 30, lng: 48, temperature: 25, windSpeed: 10, windDirection: 180 },
  { lat: 33, lng: 51, temperature: 35, windSpeed: 20, windDirection: 270 },
  { lat: 36, lng: 54, temperature: 15, windSpeed: 5, windDirection: 90 },
];

describe('useWeatherLayers', () => {
  beforeEach(() => {
    useWeatherStore.setState({ grid: [], connectionStatus: 'loading', lastFetchAt: null });
    useLayerStore.getState().resetLayers();
  });

  it('returns empty array when weather layer is inactive', () => {
    useWeatherStore.setState({ grid: mockGrid });
    // Weather layer NOT active
    const { result } = renderHook(() => useWeatherLayers());
    expect(result.current).toEqual([]);
  });

  it('returns 3 layers when weather layer is active and grid has data', () => {
    useWeatherStore.setState({ grid: mockGrid });
    useLayerStore.getState().toggleLayer('weather');
    const { result } = renderHook(() => useWeatherLayers());
    expect(result.current).toHaveLength(3);
    expect(result.current[0].id).toBe('weather-temp-dots');
    expect(result.current[1].id).toBe('weather-wind-barbs');
    expect(result.current[2].id).toBe('weather-picker');
  });
});

describe('WeatherTooltip', () => {
  const point: WeatherGridPoint = {
    lat: 32, lng: 50, temperature: 25, windSpeed: 15, windDirection: 180,
  };

  it('renders temperature in both C and F', () => {
    render(<WeatherTooltip point={point} x={100} y={100} />);
    expect(screen.getByText('25.0C / 77.0F')).toBeTruthy();
  });

  it('renders wind direction and speed', () => {
    render(<WeatherTooltip point={point} x={100} y={100} />);
    expect(screen.getByText('Wind: S 15 kn')).toBeTruthy();
  });
});

describe('LEGEND_REGISTRY', () => {
  it('includes a weather entry', () => {
    const weatherLegend = LEGEND_REGISTRY.find((l) => l.layerId === 'weather');
    expect(weatherLegend).toBeTruthy();
    expect(weatherLegend!.title).toBe('Temperature');
    expect(weatherLegend!.colorStops.length).toBe(4);
  });
});
