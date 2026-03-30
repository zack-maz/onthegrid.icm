# Deferred Items - Phase 15

## Pre-existing Test Failures

**entityLayers.test.ts** - 3 failures (pre-existing, not caused by Phase 15 changes):
- `ICON_SIZE > airstrike` - expected meters:8000/minPixels:24 but got meters:5000/minPixels:16
- `ICON_SIZE > groundCombat` - same mismatch
- `ICON_SIZE > targeted` - same mismatch

These tests expect the old flight/ship sizing (8000m/24px) but conflict events use smaller sizing (5000m/16px). The test expectations need updating to match the current CLAUDE.md documentation.
