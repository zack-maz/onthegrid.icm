import type { ProximityPin } from '@/stores/filterStore';

interface ProximityFilterProps {
  pin: ProximityPin | null;
  radiusKm: number;
  isSettingPin: boolean;
  onSetPin: (pin: ProximityPin | null) => void;
  onClearPin: () => void;
  onRadiusChange: (km: number) => void;
  onStartSettingPin: () => void;
}

const RADIUS_TICKS = [25, 50, 100, 250, 500];

export function ProximityFilter({
  pin,
  radiusKm,
  isSettingPin,
  onClearPin,
  onRadiusChange,
  onStartSettingPin,
}: ProximityFilterProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* Pin controls */}
      <div className="flex items-center gap-2">
        {!pin && !isSettingPin && (
          <button
            onClick={onStartSettingPin}
            className="text-[10px] font-medium text-accent-blue hover:underline"
          >
            Set pin
          </button>
        )}
        {isSettingPin && (
          <span className="text-[10px] text-accent-yellow">
            Click map...
          </span>
        )}
        {pin && (
          <>
            <span className="font-mono text-[10px] text-text-secondary">
              {pin.lat.toFixed(3)}, {pin.lng.toFixed(3)}
            </span>
            <button
              onClick={onClearPin}
              className="text-[10px] text-text-muted hover:text-accent-red"
              aria-label="Clear pin"
            >
              x
            </button>
          </>
        )}
      </div>

      {/* Radius slider */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-muted">Radius</span>
          <span className="font-mono text-[10px] text-text-secondary">
            {radiusKm} km
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={500}
          step={5}
          value={radiusKm}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="proximity-radius h-4 w-full cursor-pointer appearance-none bg-transparent"
          aria-label="Proximity radius"
        />
        <div className="flex justify-between px-0.5">
          {RADIUS_TICKS.map((t) => (
            <span key={t} className="text-[8px] text-text-muted">
              {t}
            </span>
          ))}
        </div>
      </div>

      <style>{`
        .proximity-radius::-webkit-slider-runnable-track {
          height: 3px;
          border-radius: 2px;
          background: var(--color-border);
        }
        .proximity-radius::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--color-accent-blue);
          margin-top: -4.5px;
          cursor: pointer;
        }
        .proximity-radius::-moz-range-track {
          height: 3px;
          border-radius: 2px;
          background: var(--color-border);
        }
        .proximity-radius::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--color-accent-blue);
          border: none;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
