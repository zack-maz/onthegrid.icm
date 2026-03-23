interface HeadingSliderProps {
  value: number | null;
  onChange: (v: number | null) => void;
}

export function HeadingSlider({ value, onChange }: HeadingSliderProps) {
  const angle = value ?? 0;
  const isActive = value !== null;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">Heading</span>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] text-text-secondary">
            {isActive ? `${angle}\u00B0` : '---'}
          </span>
          {isActive && (
            <button
              onClick={() => onChange(null)}
              className="text-[10px] text-text-muted hover:text-accent-red"
              aria-label="Clear heading filter"
            >
              x
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={360}
        step={5}
        value={angle}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-thumb h-5 w-full appearance-none bg-transparent"
        aria-label="Heading angle"
      />
      <div className="flex justify-between text-[8px] text-text-muted">
        <span>N</span><span>E</span><span>S</span><span>W</span><span>N</span>
      </div>
    </div>
  );
}
