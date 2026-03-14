export function MapVignette() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[var(--z-overlay)]"
      style={{
        background:
          'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.25) 100%)',
      }}
    />
  );
}
