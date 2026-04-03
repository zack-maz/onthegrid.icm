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

  it('renders stress level and health percentage', () => {
    render(<WaterTooltip facility={mockFacility} />);
    // compositeHealth 0.4 = 40%
    expect(screen.getByText(/Water Stress: High \(40% health\)/)).toBeDefined();
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

  it('returns empty array when water layer is inactive', async () => {
    const { useWaterLayers } = await import('@/hooks/useWaterLayers');
    let result: unknown[] = [];
    function TestComponent() {
      result = useWaterLayers();
      return null;
    }
    render(<TestComponent />);
    expect(result).toEqual([]);
  });

  it('returns 3 layers when water layer is active', async () => {
    useLayerStore.setState({ activeLayers: new Set(['water']) });
    useWaterStore.setState({
      facilities: [mockFacility],
      connectionStatus: 'connected',
    });

    const { useWaterLayers } = await import('@/hooks/useWaterLayers');
    let result: unknown[] = [];
    function TestComponent() {
      result = useWaterLayers();
      return null;
    }
    render(<TestComponent />);
    expect(result).toHaveLength(3);
  });

  it('layers have correct IDs', async () => {
    useLayerStore.setState({ activeLayers: new Set(['water']) });
    useWaterStore.setState({
      facilities: [mockFacility],
      connectionStatus: 'connected',
    });

    const { useWaterLayers } = await import('@/hooks/useWaterLayers');
    let result: { id: string }[] = [];
    function TestComponent() {
      result = useWaterLayers() as { id: string }[];
      return null;
    }
    render(<TestComponent />);
    expect(result[0].id).toBe('water-rivers');
    expect(result[1].id).toBe('water-river-labels');
    expect(result[2].id).toBe('water-facility-icons');
  });
});

describe('WaterOverlay component', () => {
  it('renders null without error', async () => {
    const { WaterOverlay } = await import('@/components/map/layers/WaterOverlay');
    const { container } = render(<WaterOverlay />);
    expect(container.innerHTML).toBe('');
  });
});
