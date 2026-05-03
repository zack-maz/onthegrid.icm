import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useLayerStore } from '@/stores/layerStore';
import { useWaterStore } from '@/stores/waterStore';
import { WaterTooltip } from '@/components/map/layers/WaterOverlay';
import type { WaterFacility } from '../../server/types';

const mockFacility: WaterFacility = {
  id: 'water-12345',
  type: 'water',
  facilityType: 'dam',
  lat: 33.44,
  lng: 48.35,
  label: 'Karkheh Dam',
  operator: 'Iran Water',
  osmId: 12345,
  stress: {
    bws_raw: 2.5,
    bws_score: 3.0,
    bws_label: 'High',
    drr_score: 2.0,
    gtd_score: 1.5,
    sev_score: 2.5,
    iav_score: 3.0,
    compositeHealth: 0.4,
  },
};

const mockFacilityWithPrecip: WaterFacility = {
  ...mockFacility,
  precipitation: {
    last30DaysMm: 45,
    anomalyRatio: 0.8,
    updatedAt: Date.now(),
  },
};

describe('WaterTooltip', () => {
  it('renders facility name and type label', () => {
    render(<WaterTooltip facility={mockFacility} />);
    expect(screen.getByText('Karkheh Dam')).toBeDefined();
    expect(screen.getByText('Dam')).toBeDefined();
  });

  it('renders stress level and health score', () => {
    render(<WaterTooltip facility={mockFacility} />);
    // compositeHealth 0.4 → healthToScore(0.4) = 5, scoreToLabel(5) = 'Moderate'
    expect(screen.getByText(/Health: 5\/10/)).toBeDefined();
  });

  it('renders color indicator dot', () => {
    const { container } = render(<WaterTooltip facility={mockFacility} />);
    const dot = container.querySelector('.rounded-full');
    expect(dot).toBeTruthy();
    expect(dot!.getAttribute('style')).toContain('rgb');
  });

  it('renders precipitation info when available', () => {
    render(<WaterTooltip facility={mockFacilityWithPrecip} />);
    expect(screen.getByText(/30-day precip: 45 mm, 80% of normal/)).toBeDefined();
  });

  it('does not render precipitation info when not available', () => {
    const { container } = render(<WaterTooltip facility={mockFacility} />);
    expect(container.textContent).not.toContain('30-day precip');
  });
});

describe('useWaterLayers', () => {
  beforeEach(() => {
    useLayerStore.setState({ activeLayers: new Set() });
    useWaterStore.setState({ facilities: [], connectionStatus: 'idle' });
  });

  it('returns empty arrays when water layer is inactive', async () => {
    const { useWaterLayers } = await import('@/hooks/useWaterLayers');
    let result: { riverLayers: unknown[]; facilityLayers: unknown[] } = {
      riverLayers: [],
      facilityLayers: [],
    };
    function TestComponent() {
      result = useWaterLayers();
      return null;
    }
    render(<TestComponent />);
    expect(result.riverLayers).toEqual([]);
    expect(result.facilityLayers).toEqual([]);
  });

  it('returns river and facility layers when water layer is active', async () => {
    useLayerStore.setState({ activeLayers: new Set(['water']) });
    useWaterStore.setState({
      facilities: [mockFacility],
      connectionStatus: 'connected',
    });

    const { useWaterLayers } = await import('@/hooks/useWaterLayers');
    let result: { riverLayers: unknown[]; facilityLayers: unknown[] } = {
      riverLayers: [],
      facilityLayers: [],
    };
    function TestComponent() {
      result = useWaterLayers();
      return null;
    }
    render(<TestComponent />);
    // 2 river layers (path + labels) + 1 facility layer
    expect(result.riverLayers).toHaveLength(2);
    expect(result.facilityLayers).toHaveLength(1);
  });

  it('layers have correct IDs', async () => {
    useLayerStore.setState({ activeLayers: new Set(['water']) });
    useWaterStore.setState({
      facilities: [mockFacility],
      connectionStatus: 'connected',
    });

    const { useWaterLayers } = await import('@/hooks/useWaterLayers');
    let result: { riverLayers: { id: string }[]; facilityLayers: { id: string }[] } = {
      riverLayers: [],
      facilityLayers: [],
    };
    function TestComponent() {
      result = useWaterLayers() as typeof result;
      return null;
    }
    render(<TestComponent />);
    expect(result.riverLayers[0].id).toBe('water-rivers');
    expect(result.riverLayers[1].id).toBe('water-river-labels');
    expect(result.facilityLayers[0].id).toBe('water-facility-icons');
  });
});
