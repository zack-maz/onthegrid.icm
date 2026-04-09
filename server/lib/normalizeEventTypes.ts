import type { ConflictEventEntity, ConflictEventType } from '../types.js';

/**
 * Mapping from old 11-type taxonomy to new 5-type taxonomy.
 *
 * Background: Phase 27 collapsed 11 CAMEO-derived conflict event types into 5
 * broader categories for the LLM pipeline. Events cached in Redis under the
 * old taxonomy must be remapped before Zod validation (which only accepts the
 * 5 new types) — otherwise sendValidated rejects them.
 */
const OLD_TO_NEW_TYPE: Record<string, ConflictEventType> = {
  ground_combat: 'on_ground',
  assault: 'on_ground',
  shelling: 'explosion',
  bombing: 'explosion',
  assassination: 'targeted',
  abduction: 'targeted',
  blockade: 'other',
  ceasefire_violation: 'other',
  mass_violence: 'other',
  wmd: 'other',
};

/**
 * Normalize an array of conflict event entities from old 11-type taxonomy
 * to new 5-type taxonomy. Events already using new types pass through
 * unchanged. Returns a new array (does not mutate input).
 *
 * Also normalizes `data.eventType` if it matches an old type key, keeping
 * the inner data consistent with the top-level type field.
 */
export function normalizeEventTypes(
  events: ConflictEventEntity[],
): ConflictEventEntity[] {
  return events.map((event) => {
    const mappedType = OLD_TO_NEW_TYPE[event.type];
    const mappedDataType = OLD_TO_NEW_TYPE[event.data.eventType];

    // If neither field needs mapping, return the original event (no copy)
    if (!mappedType && !mappedDataType) {
      return event;
    }

    return {
      ...event,
      type: mappedType ?? event.type,
      data: mappedDataType
        ? { ...event.data, eventType: mappedDataType }
        : event.data,
    };
  });
}
