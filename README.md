# Iran Conflict Monitor

A personal real-time intelligence dashboard for monitoring the Iran conflict. Displays a 2.5D map of Iran with live data points for ships, flights, missiles, and drones sourced from public APIs. Prioritizes concrete mathematical data — movement vectors, strike counts, timelines, force posture — over qualitative news reporting.

## Quick Start

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Current State

Interactive 2.5D map of Iran with CARTO Dark Matter tiles, 3D terrain (AWS Terrarium DEM), compass control, coordinate readout, scale bar, vignette effect, and ripple loading animation. Dark-themed layout shell with floating overlay regions.

**Next up:** Express API proxy for external data sources (OpenSky, AISStream, ACLED).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.9, Vite 6 |
| Styling | Tailwind CSS v4 (dark theme, CSS-first @theme) |
| State | Zustand 5 |
| Map | Deck.gl + MapLibre GL JS (2.5D rendering) |
| Backend | Express 5 (API proxy — planned) |
| Data Sources | OpenSky Network, AISStream.io, ACLED |
| Testing | Vitest + Testing Library |

## Project Structure

```
src/
├── components/
│   ├── layout/     # AppShell, overlay regions
│   ├── map/        # BaseMap, overlays (compass, coords, vignette, loading)
│   └── ui/         # Reusable UI components
├── stores/         # Zustand stores (mapStore, uiStore)
├── styles/         # Global CSS, animations
├── types/          # TypeScript interfaces
└── __tests__/      # Component and store tests
```

## Design

- **Theme:** Dark background, white grid, restrained color accents
- **Colors:** Blue (naval/friendly), Red (hostile/strikes), Green (safe), Yellow (warning)
- **Map:** CARTO Dark Matter base, 3D terrain with 3x exaggeration, 50-degree pitch
- **News:** Non-statistical content hidden by default

## Testing

```bash
npx vitest run              # Run all tests
npx vitest run --watch      # Watch mode
```

## License

Private — personal tool.
