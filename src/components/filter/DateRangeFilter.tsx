import { useCallback, useRef, useMemo } from 'react';
import { WAR_START, STEP_MS, LOOKBACK_MS, snapToStep } from '@/lib/constants';
import type { Granularity } from '@/stores/filterStore';

const NOW_THRESHOLD_MS = 60_000; // 60s
const THUMB_SIZE = 14; // px — matches CSS

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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

interface DateRangeFilterProps {
  dateStart: number;
  dateEnd: number;
  granularity: Granularity;
  onDateRange: (start: number, end: number) => void;
  onGranularity: (g: Granularity) => void;
}

export function DateRangeFilter({
  dateStart,
  dateEnd,
  granularity,
  onDateRange,
  onGranularity,
}: DateRangeFilterProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'lo' | 'hi' | null>(null);
  const now = Date.now();
  const step = STEP_MS[granularity];

  // Slider range: lookback limit to now, snapped
  const lookback = LOOKBACK_MS[granularity];
  const sliderMin = lookback !== null ? snapToStep(now - lookback, step) : WAR_START;
  const sliderMax = snapToStep(now, step);

  // Current handle values, clamped to slider range
  const lo = clamp(dateStart, sliderMin, sliderMax);
  const hi = clamp(dateEnd, sliderMin, sliderMax);

  // Positions as percentages
  const range = sliderMax - sliderMin || 1;
  const loPercent = ((lo - sliderMin) / range) * 100;
  const hiPercent = ((hi - sliderMin) / range) * 100;

  const startLabel = useMemo(() => formatLabel(lo, granularity), [lo, granularity]);
  const endLabel = useMemo(() => {
    if (sliderMax - hi < NOW_THRESHOLD_MS) return 'Now';
    return formatLabel(hi, granularity);
  }, [sliderMax, hi, granularity]);

  /** Convert a pointer clientX to a snapped timestamp */
  const pointerToValue = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return sliderMin;
      const rect = track.getBoundingClientRect();
      const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
      const raw = sliderMin + pct * range;
      return snapToStep(raw, step);
    },
    [sliderMin, range, step],
  );

  const commitLo = useCallback(
    (val: number) => {
      const clamped = clamp(val, sliderMin, hi - step);
      onDateRange(clamped, hi);
    },
    [hi, step, sliderMin, onDateRange],
  );

  const commitHi = useCallback(
    (val: number) => {
      const clamped = clamp(val, lo + step, sliderMax);
      const snapped = sliderMax - clamped < NOW_THRESHOLD_MS ? sliderMax : clamped;
      onDateRange(lo, snapped);
    },
    [lo, step, sliderMax, onDateRange],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const val = pointerToValue(e.clientX);
      if (dragging.current === 'lo') commitLo(val);
      else if (dragging.current === 'hi') commitHi(val);
    },
    [pointerToValue, commitLo, commitHi],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  const startDrag = useCallback(
    (which: 'lo' | 'hi') => (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = which;
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [onPointerMove, onPointerUp],
  );

  /** Click on the track to move the nearest thumb */
  const onTrackClick = useCallback(
    (e: React.MouseEvent) => {
      const val = pointerToValue(e.clientX);
      const distLo = Math.abs(val - lo);
      const distHi = Math.abs(val - hi);
      if (distLo <= distHi) commitLo(val);
      else commitHi(val);
    },
    [pointerToValue, lo, hi, commitLo, commitHi],
  );

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

      {/* Custom dual-handle slider */}
      <div
        ref={trackRef}
        className="relative h-5 cursor-pointer select-none touch-none"
        onClick={onTrackClick}
        role="group"
        aria-label="Date range slider"
      >
        {/* Track background */}
        <div className="absolute top-[9px] h-[3px] w-full rounded-full bg-border" />
        {/* Active range highlight */}
        <div
          className="absolute top-[9px] h-[3px] rounded-full bg-accent-blue/40"
          style={{ left: `${loPercent}%`, width: `${hiPercent - loPercent}%` }}
        />
        {/* Start thumb */}
        <div
          onPointerDown={startDrag('lo')}
          role="slider"
          aria-label="Date range start"
          aria-valuemin={sliderMin}
          aria-valuemax={sliderMax}
          aria-valuenow={lo}
          tabIndex={0}
          className="absolute top-[3px] rounded-full bg-accent-blue border-2 border-surface cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
          style={{
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            left: `calc(${loPercent}% - ${THUMB_SIZE / 2}px)`,
            zIndex: 4,
          }}
        />
        {/* End thumb */}
        <div
          onPointerDown={startDrag('hi')}
          role="slider"
          aria-label="Date range end"
          aria-valuemin={sliderMin}
          aria-valuemax={sliderMax}
          aria-valuenow={hi}
          tabIndex={0}
          className="absolute top-[3px] rounded-full bg-accent-blue border-2 border-surface cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
          style={{
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            left: `calc(${hiPercent}% - ${THUMB_SIZE / 2}px)`,
            zIndex: 3,
          }}
        />
      </div>

      {/* Date labels */}
      <div className="flex items-center justify-between font-mono text-[10px] text-text-secondary">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>

    </div>
  );
}
