/**
 * Water Overlay components.
 *
 * WaterTooltip: hover display for water facilities (name, type, stress, precipitation).
 */

import React from 'react';

import { getWaterFacilityDisplayName } from '@/lib/waterLabel';
import { stressToRGBA, healthToScore, scoreToLabel } from '@/lib/waterStress';

import type { WaterFacility, WaterFacilityType } from '../../../../server/types';

/** Human-readable labels for water facility types */
const WATER_TYPE_LABELS: Record<WaterFacilityType, string> = {
  dam: 'Dam',
  reservoir: 'Reservoir',
  desalination: 'Desalination Plant',
};

interface WaterTooltipProps {
  facility: WaterFacility;
  isAttacked?: boolean;
}

/**
 * Tooltip content for a hovered water facility.
 * Shows facility name, type, stress level with color indicator,
 * composite health as percentage, and precipitation anomaly if available.
 */
export function WaterTooltip({ facility, isAttacked }: WaterTooltipProps): React.ReactElement {
  const score = isAttacked ? 0 : healthToScore(facility.stress.compositeHealth);
  const [r, g, b] = isAttacked
    ? ([0, 0, 0] as const)
    : stressToRGBA(facility.stress.compositeHealth, 255);
  const colorHex = `rgb(${r}, ${g}, ${b})`;
  const label = scoreToLabel(score);

  return (
    <div className="space-y-1 text-xs">
      {/* WATER-LATIN-04: romanized display name (searchable token) with the
          preserved original on hover + as a sub-label when non-Latin. */}
      <div
        className="font-semibold text-white"
        title={facility.nameOriginal ? `${facility.nameOriginal} (original)` : undefined}
      >
        {getWaterFacilityDisplayName(facility)}
      </div>
      {facility.nameOriginal && (
        <div className="text-[10px] text-zinc-500" dir="auto" lang="und">
          {facility.nameOriginal}
        </div>
      )}
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
