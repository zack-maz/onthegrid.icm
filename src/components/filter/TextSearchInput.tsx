import { useId } from 'react';

interface TextSearchInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function TextSearchInput({ label, value, onChange, placeholder }: TextSearchInputProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-[10px] uppercase tracking-wider text-text-muted">{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? `Filter by ${label.toLowerCase()}...`}
        className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-secondary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
      />
    </div>
  );
}
