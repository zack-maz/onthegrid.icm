import type { WaterFacility } from '../../server/types';
import { FACILITY_TYPE_LABELS } from '../../server/adapters/overpass-water';

/**
 * Single source of truth for a water facility's UI display name.
 *
 * Phase 27.3.2 D-08: collapsed to a one-line read. All label synthesis
 * (including the narrow desalination fallback) now lives server-side in
 * `extractLabel` (server/adapters/overpass-water.ts). Non-desal facilities
 * whose OSM tags produce no Latin label are rejected at admission time
 * via the `no_resolved_name` bucket, so `facility.label` in a valid
 * production snapshot is guaranteed non-empty and human-readable.
 *
 * The `|| FACILITY_TYPE_LABELS[...]` clause is defensive — it should
 * never fire in a post-27.3.2 snapshot (verified by the D-13 grep
 * acceptance criterion on src/data/water-facilities.json).
 *
 * Consumed by: WaterTooltip, useCounterData.toWaterEntity,
 * useProximityAlerts.waterToSiteLike, panelLabel.getEntityName,
 * WaterFacilityDetail (img alt).
 */
export function getWaterFacilityDisplayName(facility: WaterFacility): string {
  return facility.label?.trim() || FACILITY_TYPE_LABELS[facility.facilityType];
}
