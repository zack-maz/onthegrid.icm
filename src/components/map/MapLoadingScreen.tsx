export function MapLoadingScreen({ isLoaded }: { isLoaded: boolean }) {
  return (
    <div
      className={`absolute inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-surface transition-opacity duration-500 ${
        isLoaded ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute rounded-full border border-text-muted ripple"
          style={{ animationDelay: `${i * 0.6}s` }}
        />
      ))}
    </div>
  );
}
