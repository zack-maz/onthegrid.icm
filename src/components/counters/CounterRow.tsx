import { useEffect, useRef, useState } from 'react';

interface CounterRowProps {
  label: string;
  value: number;
  color?: string;
}

const fmt = new Intl.NumberFormat('en-US');

export function CounterRow({ label, value, color }: CounterRowProps) {
  const prevRef = useRef<number>(value);
  const [delta, setDelta] = useState<number | null>(null);
  const [deltaKey, setDeltaKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevRef.current !== value) {
      const diff = value - prevRef.current;
      setDelta(diff);
      setDeltaKey((k) => k + 1);
      prevRef.current = value;

      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setDelta(null);
        timeoutRef.current = null;
      }, 3000);
    }

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value]);

  const deltaText =
    delta !== null
      ? delta > 0
        ? `+${fmt.format(delta)}`
        : fmt.format(delta)
      : null;

  return (
    <div className="flex items-center gap-4 text-xs">
      <div className="flex items-center gap-1.5 w-24 shrink-0">
        {color && (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="text-text-secondary">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="tabular-nums text-text-primary">{fmt.format(value)}</span>
        {deltaText && (
          <span
            key={deltaKey}
            className="text-accent-green text-[10px] tabular-nums animate-delta"
          >
            {deltaText}
          </span>
        )}
      </div>
    </div>
  );
}
