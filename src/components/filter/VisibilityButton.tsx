interface VisibilityButtonProps {
  label: string;
  active: boolean;
  onToggle: () => void;
  color: string;
}

export function VisibilityButton({ label, active, onToggle, color }: VisibilityButtonProps) {
  return (
    <button
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider transition-all ${
        active
          ? 'bg-white/10 text-text-secondary'
          : 'bg-transparent text-text-muted opacity-40'
      }`}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </button>
  );
}
