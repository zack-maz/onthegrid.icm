interface DateRangeFilterProps {
  dateStart: number | null;
  dateEnd: number | null;
  onDateRange: (start: number | null, end: number | null) => void;
}

const PRESETS: { label: string; ms: number | null }[] = [
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'All', ms: null },
];

function isPresetActive(
  presetMs: number | null,
  dateStart: number | null,
): boolean {
  if (presetMs === null) return dateStart === null;
  if (dateStart === null) return false;
  // Allow 5s tolerance for "recently clicked" match
  const expected = Date.now() - presetMs;
  return Math.abs(dateStart - expected) < 5000;
}

export function DateRangeFilter({
  dateStart,
  dateEnd,
  onDateRange,
}: DateRangeFilterProps) {
  const handlePreset = (ms: number | null) => {
    if (ms === null) {
      onDateRange(null, null);
    } else {
      onDateRange(Date.now() - ms, null);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] text-text-muted">Events only</span>
      <div className="flex gap-1">
        {PRESETS.map(({ label, ms }) => {
          const active = isPresetActive(ms, dateStart);
          return (
            <button
              key={label}
              onClick={() => handlePreset(ms)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                active
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
