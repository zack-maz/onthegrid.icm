import { useEffect, useRef, useState } from 'react';

interface DetailValueProps {
  label: string;
  value: string;
  unit?: string;
}

export function DetailValue({ label, value, unit }: DetailValueProps) {
  const prevRef = useRef<string>(value);
  const [flash, setFlash] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevRef.current !== value) {
      setFlash(true);
      timeoutRef.current = setTimeout(() => {
        setFlash(false);
      }, 600);
      prevRef.current = value;
    }

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value]);

  return (
    <div className="flex items-center justify-between px-3 py-1">
      <span className="text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <span className={`tabular-nums text-text-primary${flash ? ' animate-flash' : ''}`}>
        {value}
        {unit && <span className="ml-1 text-text-muted">{unit}</span>}
      </span>
    </div>
  );
}
