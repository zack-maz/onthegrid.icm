import { useState, useEffect } from 'react';

function useUtcClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time.toISOString().slice(11, 19) + 'Z';
}

export function UtcClock() {
  const utc = useUtcClock();

  return (
    <div
      data-testid="utc-clock"
      className="absolute bottom-4 right-4 z-[var(--z-controls)] rounded-md bg-surface-overlay/80 px-2 py-1 backdrop-blur-sm"
    >
      <span className="text-xs text-text-secondary tabular-nums tracking-wide">
        {utc}
      </span>
    </div>
  );
}
