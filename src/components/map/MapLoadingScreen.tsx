export function MapLoadingScreen({ isLoaded }: { isLoaded: boolean }) {
  return (
    <div
      className={`absolute inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-surface transition-opacity duration-500 ${
        isLoaded ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div className="h-3 w-3 animate-pulse rounded-full bg-text-muted" />
    </div>
  );
}
