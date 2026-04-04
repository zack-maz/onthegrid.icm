/**
 * Water Overlay components.
 *
 * WaterTooltip: hover display for water facilities (name, type, stress, precipitation).
 * WaterOverlay: renders null (behavior-only pattern, consistent with other overlays).
 */

import React from 'react';
import { stressToRGBA, bwsScoreToLabel, healthToScore, scoreToLabel } from '@/lib/waterStress';
import type { WaterFacility, WaterFacilityType } from '../../../../server/types';

/** Human-readable labels for water facility types */
const WATER_TYPE_LABELS: Record<WaterFacilityType, string> = {
  dam: 'Dam',
  reservoir: 'Reservoir',
  desalination: 'Desalination Plant',
  treatment_plant: 'Treatment Plant',
};

interface WaterTooltipProps {
  facility: WaterFacility;
}

/**
 * Tooltip content for a hovered water facility.
 * Shows facility name, type, stress level with color indicator,
 * composite health as percentage, and precipitation anomaly if available.
 */
export function WaterTooltip({ facility }: WaterTooltipProps): React.ReactElement {
  const score = healthToScore(facility.stress.compositeHealth);
  const [r, g, b] = stressToRGBA(facility.stress.compositeHealth, 255);
  const colorHex = `rgb(${r}, ${g}, ${b})`;
  const label = scoreToLabel(score);

  return (
    <div className="space-y-1 text-xs">
      <div className="font-semibold text-white">{facility.label}</div>
      <div className="text-zinc-400">{WATER_TYPE_LABELS[facility.facilityType]}</div>
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: colorHex }}
        />
        <span className="text-zinc-300">
          Health: {score}/10 — {label}
        </span>
      </div>
      {facility.precipitation && (
        <div className="text-zinc-400">
          30-day precip: {facility.precipitation.last30DaysMm.toFixed(0)} mm,{' '}
          {Math.round(facility.precipitation.anomalyRatio * 100)}% of normal
        </div>
      )}
    </div>
  );
}

/**
 * Behavior-only overlay component.
 * Water layers are rendered via useWaterLayers hook; this component
 * exists for consistency with the overlay pattern.
 */
export function WaterOverlay(): React.ReactElement | null {
  return null;
}
