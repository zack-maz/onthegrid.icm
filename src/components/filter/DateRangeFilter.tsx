import { useId, useMemo } from 'react';
import { WAR_START, STEP_MS, snapToStep } from '@/lib/constants';
import type { Granularity } from '@/stores/filterStore';

const NOW_THRESHOLD_MS = 60_000; // 60s

const GRANULARITY_LABELS: { key: Granularity; label: string }[] = [
  { key: 'minute', label: 'Min' },
  { key: 'hour', label: 'Hr' },
  { key: 'day', label: 'Day' },
];

function formatLabel(ts: number, granularity: Granularity): string {
  const d = new Date(ts);
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  if (granularity === 'day') return `${month} ${day}`;
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${month} ${day} ${h}:${m}`;
}

interface DateRangeFilterProps {
  dateStart: number | null;
  dateEnd: number | null;
  granularity: Granularity;
  isCustomRangeActive: boolean;
  onDateRange: (start: number | null, end: number | null) => void;
  onGranularity: (g: Granularity) => void;
}

export function DateRangeFilter({
  dateStart,
  dateEnd,
  granularity,
  isCustomRangeActive,
  onDateRange,
  onGranularity,
}: DateRangeFilterProps) {
  const id = useId();
  const now = Date.now();
  const step = STEP_MS[granularity];

  // Slider range: WAR_START to now, snapped
  const sliderMin = WAR_START;
  const sliderMax = snapToStep(now, step);

  // Current handle values
  const lo = dateStart ?? snapToStep(now - 60 * 60 * 1000, step);
  const hi = dateEnd ?? sliderMax;

  // Positions for filled track
  const range = sliderMax - sliderMin || 1;
  const loPercent = ((lo - sliderMin) / range) * 100;
  const hiPercent = ((hi - sliderMin) / range) * 100;

  const startLabel = useMemo(() => formatLabel(lo, granularity), [lo, granularity]);
  const endLabel = useMemo(() => {
    if (dateEnd === null) return 'Now';
    return formatLabel(hi, granularity);
  }, [dateEnd, hi, granularity]);

  const handleStartChange = (raw: number) => {
    const snapped = snapToStep(raw, step);
    const clamped = Math.min(snapped, hi);
    onDateRange(clamped, dateEnd);
  };

  const handleEndChange = (raw: number) => {
    const snapped = snapToStep(raw, step);
    const clamped = Math.max(snapped, lo);
    // If within threshold of now, treat as "now" (deactivate custom range)
    if (sliderMax - clamped < NOW_THRESHOLD_MS) {
      onDateRange(dateStart, null);
    } else {
      onDateRange(dateStart, clamped);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Granularity toggle */}
      <div className="flex gap-1">
        {GRANULARITY_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onGranularity(key)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
              granularity === key
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Dual-handle slider */}
      <div className="relative h-5">
        {/* Track background */}
        <div className="absolute top-[9px] h-[3px] w-full rounded-full bg-border" />
        {/* Active range highlight */}
        <div
          className="absolute top-[9px] h-[3px] rounded-full bg-accent-blue/40"
          style={{ left: `${loPercent}%`, width: `${hiPercent - loPercent}%` }}
        />
        {/* Start handle */}
        <input
          id={`${id}-start`}
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={step}
          value={lo}
          onChange={(e) => handleStartChange(Number(e.target.value))}
          className="range-thumb absolute top-0 h-5 w-full appearance-none bg-transparent"
          aria-label="Date range start"
        />
        {/* End handle */}
        <input
          id={`${id}-end`}
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={step}
          value={hi}
          onChange={(e) => handleEndChange(Number(e.target.value))}
          className="range-thumb range-thumb-top absolute top-0 h-5 w-full appearance-none bg-transparent"
          aria-label="Date range end"
        />
      </div>

      {/* Date labels */}
      <div className="flex items-center justify-between font-mono text-[10px] text-text-secondary">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>

      {/* Live feeds paused indicator */}
      {isCustomRangeActive && (
        <span className="text-[9px] text-amber-400/80">Live feeds paused</span>
      )}
    </div>
  );
}
