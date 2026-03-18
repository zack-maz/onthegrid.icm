import { useId } from 'react';

interface RangeSliderProps {
  min: number;
  max: number;
  valueMin: number | null;
  valueMax: number | null;
  step?: number;
  unit?: string;
  label: string;
  onChangeMin: (v: number | null) => void;
  onChangeMax: (v: number | null) => void;
}

export function RangeSlider({
  min,
  max,
  valueMin,
  valueMax,
  step = 1,
  unit = '',
  label,
  onChangeMin,
  onChangeMax,
}: RangeSliderProps) {
  const id = useId();
  const lo = valueMin ?? min;
  const hi = valueMax ?? max;

  // Calculate positions for value labels
  const loPercent = ((lo - min) / (max - min)) * 100;
  const hiPercent = ((hi - min) / (max - min)) * 100;

  const handleMinChange = (v: number) => {
    const clamped = Math.min(v, hi);
    onChangeMin(clamped <= min ? null : clamped);
  };

  const handleMaxChange = (v: number) => {
    const clamped = Math.max(v, lo);
    onChangeMax(clamped >= max ? null : clamped);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-muted">{label}</span>
        <span className="font-mono text-[10px] text-text-secondary">
          {lo === min && hi === max
            ? '---'
            : `${lo}${unit && ` ${unit}`} - ${hi}${unit && ` ${unit}`}`}
        </span>
      </div>
      <div className="relative h-5">
        {/* Track background */}
        <div className="absolute top-[9px] h-[3px] w-full rounded-full bg-border" />
        {/* Active range highlight */}
        <div
          className="absolute top-[9px] h-[3px] rounded-full bg-accent-blue/40"
          style={{
            left: `${loPercent}%`,
            width: `${hiPercent - loPercent}%`,
          }}
        />
        {/* Min thumb */}
        <input
          id={`${id}-min`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => handleMinChange(Number(e.target.value))}
          className="range-thumb absolute top-0 h-5 w-full appearance-none bg-transparent"
          aria-label={`${label} minimum`}
        />
        {/* Max thumb - pointer-events on thumb only */}
        <input
          id={`${id}-max`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => handleMaxChange(Number(e.target.value))}
          className="range-thumb range-thumb-top absolute top-0 h-5 w-full appearance-none bg-transparent"
          aria-label={`${label} maximum`}
        />
      </div>
      <style>{`
        .range-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--color-accent-blue);
          cursor: pointer;
          position: relative;
          z-index: 2;
        }
        .range-thumb::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--color-accent-blue);
          border: none;
          cursor: pointer;
          position: relative;
          z-index: 2;
        }
        .range-thumb-top {
          pointer-events: none;
        }
        .range-thumb-top::-webkit-slider-thumb {
          pointer-events: auto;
        }
        .range-thumb-top::-moz-range-thumb {
          pointer-events: auto;
        }
      `}</style>
    </div>
  );
}
