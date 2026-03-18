import { useId, useState, useCallback } from 'react';

interface CountryFilterProps {
  selectedCountries: string[];
  onAdd: (country: string) => void;
  onRemove: (country: string) => void;
  availableCountries: string[];
}

export function CountryFilter({
  selectedCountries,
  onAdd,
  onRemove,
  availableCountries,
}: CountryFilterProps) {
  const id = useId();
  const [input, setInput] = useState('');

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && input.trim()) {
        e.preventDefault();
        onAdd(input.trim());
        setInput('');
      }
    },
    [input, onAdd],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInput(val);
      // Auto-add on datalist selection (value matches an available country exactly)
      if (availableCountries.includes(val)) {
        onAdd(val);
        setInput('');
      }
    },
    [availableCountries, onAdd],
  );

  const listId = `${id}-countries`;

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        list={listId}
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type country..."
        className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-secondary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
      />
      <datalist id={listId}>
        {availableCountries
          .filter((c) => !selectedCountries.includes(c))
          .map((c) => (
            <option key={c} value={c} />
          ))}
      </datalist>
      {selectedCountries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedCountries.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[10px] text-text-secondary"
            >
              {c}
              <button
                onClick={() => onRemove(c)}
                className="text-text-muted hover:text-accent-red"
                aria-label={`Remove ${c}`}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
