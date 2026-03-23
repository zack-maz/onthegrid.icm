import { useFilterStore } from '@/stores/filterStore';

export function SeverityToggles() {
  const high = useFilterStore((s) => s.showHighSeverity);
  const med = useFilterStore((s) => s.showMediumSeverity);
  const low = useFilterStore((s) => s.showLowSeverity);
  const setHigh = useFilterStore((s) => s.setShowHighSeverity);
  const setMed = useFilterStore((s) => s.setShowMediumSeverity);
  const setLow = useFilterStore((s) => s.setShowLowSeverity);

  const items = [
    { label: 'High', active: high, toggle: () => setHigh(!high), color: '#ef4444' },
    { label: 'Medium', active: med, toggle: () => setMed(!med), color: '#f59e0b' },
    { label: 'Low', active: low, toggle: () => setLow(!low), color: '#6b7280' },
  ];

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-text-muted">Severity</span>
      <div className="flex gap-1">
        {items.map(({ label, active, toggle, color }) => (
          <button
            key={label}
            role="switch"
            aria-checked={active}
            onClick={toggle}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
              active
                ? 'bg-white/10 text-text-secondary'
                : 'bg-transparent text-text-muted opacity-40'
            }`}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full mr-1" style={{ backgroundColor: color }} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
