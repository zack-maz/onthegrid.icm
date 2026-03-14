interface OverlayPanelProps {
  children: React.ReactNode;
  className?: string;
}

export function OverlayPanel({ children, className = '' }: OverlayPanelProps) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface-overlay px-4 py-3 shadow-lg backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}
