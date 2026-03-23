# Search & Filter Unification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify search and filter systems so they are always bidirectionally synced, simplify search grammar to implicit OR (no AND, no negation), redesign the filter panel with per-entity controls (visibility buttons, search bars, sliders, toggles), and remove goldstein/vertical tags.

**Architecture:** The search bar and filter panel become two views of the same state. Typing a query updates filter controls; changing a filter control updates the search query. The parser is simplified to produce only OR chains of tags/text. The `filterStore` becomes the single source of truth for all filter state, with `useQuerySync` handling bidirectional translation.

**Design note — OR search vs AND filters:** The search bar uses implicit OR semantics (typing `callsign:IRA mmsi:123` matches flights with IRA OR ships with 123). The filter panel uses entity-scoped AND semantics (each filter only applies to its entity type — MMSI filter ignores flights, callsign filter ignores ships). These reconcile naturally: cross-type queries act as OR because each entity is only tested against filters relevant to its type. Within the same entity type, multiple active filters AND together (e.g., callsign + altitude for flights).

**Tech Stack:** TypeScript, React, Zustand, Tailwind CSS v4, Vitest

---

## File Map

### Modified files:
- `src/lib/queryParser.ts` — Remove AND/NOT nodes, make implicit OR
- `src/lib/querySerializer.ts` — Simplify to OR-only serialization
- `src/lib/queryEvaluator.ts` — Remove AND/NOT/goldstein/vertical evaluation; all terms are OR'd
- `src/lib/tagRegistry.ts` — Remove goldstein/vertical/squawk; add heading to flights
- `src/lib/searchUtils.ts` — No changes needed
- `src/lib/filters.ts` — Add mentions range, heading filter, CAMEO filter; remove ship speed block; normalize date filter
- `src/lib/severity.ts` — Add `classifySeverity()` pure function using snapshot score (no recency decay) for filter classification
- `src/stores/filterStore.ts` — Add mentionsMin/Max, headingAngle, cameoCode, flightCallsign, flightIcao, shipMmsi, shipName, severityHigh/Med/Low toggles; remove savedToggles logic; remove shipSpeed
- `src/stores/uiStore.ts` — Add showHealthySites, showAttackedSites toggles; keep existing toggles
- `src/stores/searchStore.ts` — Remove isFilterMode (always synced); simplify
- `src/types/ui.ts` — Add new toggle types to LayerToggles
- `src/hooks/useQuerySync.ts` — Major rewrite for full bidirectional sync with new filter fields
- `src/hooks/useFilteredEntities.ts` — Remove savedToggles-based custom range logic; date is just a normal filter
- `src/hooks/useEntityLayers.ts` — Add severity filtering, healthy/attacked site filtering
- `src/hooks/useSearchResults.ts` — Remove isFilterMode; search always evaluates
- `src/hooks/useAutocomplete.ts` — Remove AND/OR keyword skip
- `src/components/layout/FilterPanelSlot.tsx` — Complete redesign with all new controls
- `src/components/layout/LayerTogglesSlot.tsx` — Keep as-is (layer toggles stay separate from filters)
- `src/components/layout/Sidebar.tsx` — Update filter section to show new panel
- `src/components/search/SearchModal.tsx` — Remove "apply as filter" flow; search always syncs
- `src/components/search/CheatSheet.tsx` — Remove goldstein/vertical/squawk entries
- `src/components/filter/DateRangeFilter.tsx` — Remove "Live feeds paused" indicator
- `src/components/counters/useCounterData.ts` — Update to account for severity toggles

### New files:
- `src/components/filter/TextSearchInput.tsx` — Reusable mini search bar for CAMEO, callsign, ICAO, MMSI, ship name
- `src/components/filter/HeadingSlider.tsx` — Single-thumb circular angle slider (0-360)
- `src/components/filter/VisibilityButton.tsx` — Reusable toggle button for entity/subtype visibility
- `src/components/filter/SeverityToggles.tsx` — Three toggle buttons for Low/Medium/High severity

### Test files to update:
- `src/__tests__/searchStore.test.ts`
- `src/__tests__/filterStore.test.ts`
- `src/__tests__/uiStore.test.ts`
- `src/__tests__/filters.test.ts`
- `src/__tests__/FilterPanel.test.tsx`
- `src/__tests__/SearchModal.test.tsx`
- `src/__tests__/useCounterData.test.ts`
- `src/__tests__/CountersSlot.test.tsx`
- `src/__tests__/entityLayers.test.ts`

---

## Task 1: Simplify Query Parser (remove AND, NOT, negation)

**Files:**
- Modify: `src/lib/queryParser.ts`
- Modify: `src/lib/querySerializer.ts`

- [ ] **Step 1: Update AST node types**

Remove `AndNode` and `NotNode` from `QueryNode` union. Remove `negated` from `TagNode`. Keep `OrNode` and `TagNode` and `TextNode`.

In `src/lib/queryParser.ts`, replace the type definitions:

```typescript
export type QueryNode =
  | TagNode
  | TextNode
  | OrNode;

export interface TagNode {
  type: 'tag';
  prefix: string;
  value: string;
}

export interface TextNode {
  type: 'text';
  value: string;
}

export interface OrNode {
  type: 'or';
  left: QueryNode;
  right: QueryNode;
}
```

Remove `AndNode`, `NotNode` interfaces entirely.

- [ ] **Step 2: Update TokenType and tokenizer**

Remove `'AND'` from `TokenType`. Remove `negated` from `Token`. In `tokenize()`:
- Remove the `AND` keyword check (lines 109-111)
- Remove the negation `!` prefix handling (lines 83-89, 102-106, 137-143)
- Keep `OR` keyword, `TAG`, `TEXT`, `LPAREN`, `RPAREN`

Updated `TokenType`:
```typescript
export type TokenType = 'TAG' | 'TEXT' | 'OR' | 'LPAREN' | 'RPAREN';
```

Updated `Token` — remove `negated` field.

- [ ] **Step 3: Simplify parser to implicit OR**

Replace `parseOr`, `parseAnd`, `parseFactor` with simpler grammar:
- `expr = factor (OR|implicit factor)*` — everything is OR'd

```typescript
export function parse(input: string): QueryNode | null {
  const tokens = tokenize(input);
  if (tokens.length === 0) return null;

  let pos = 0;

  function peek(): Token | undefined { return tokens[pos]; }
  function consume(): Token { return tokens[pos++]; }
  function isAtEnd(): boolean { return pos >= tokens.length; }

  // factor = '(' expr ')' | tag | text
  function parseFactor(): QueryNode | null {
    const t = peek();
    if (!t) return null;

    if (t.type === 'LPAREN') {
      consume();
      const expr = parseExpr();
      if (!isAtEnd() && peek()?.type === 'RPAREN') consume();
      return expr;
    }

    if (t.type === 'TAG') {
      consume();
      return { type: 'tag', prefix: t.prefix!, value: t.tagValue! };
    }

    if (t.type === 'TEXT') {
      consume();
      return { type: 'text', value: t.value };
    }

    consume(); // skip unexpected
    return parseFactor();
  }

  // expr = factor (OR|implicit factor)*
  function parseExpr(): QueryNode | null {
    let left = parseFactor();
    if (!left) return null;

    while (!isAtEnd()) {
      const t = peek();
      if (!t) break;

      if (t.type === 'OR') {
        consume();
        const right = parseFactor();
        if (!right) break;
        left = { type: 'or', left, right };
      } else if (t.type === 'TAG' || t.type === 'TEXT' || t.type === 'LPAREN') {
        const right = parseFactor();
        if (!right) break;
        left = { type: 'or', left, right }; // implicit OR
      } else {
        break;
      }
    }

    return left;
  }

  return parseExpr();
}
```

- [ ] **Step 4: Update serializer**

In `src/lib/querySerializer.ts`, remove `and` and `not` cases. Remove `negated` from tag serialization:

```typescript
export function serialize(node: QueryNode | null): string {
  if (!node) return '';
  return serializeNode(node);
}

function serializeNode(node: QueryNode): string {
  switch (node.type) {
    case 'tag': {
      const val = node.value === '*' ? '' : node.value;
      return `${node.prefix}:${val}`;
    }
    case 'text':
      return node.value;
    case 'or': {
      const left = serializeNode(node.left);
      const right = serializeNode(node.right);
      return `${left} ${right}`;
    }
  }
}
```

Note: We serialize OR as space-separated (implicit OR) for clean display.

- [ ] **Step 5: Run tests, fix compile errors**

Run: `npx vitest run src/__tests__/searchStore.test.ts --reporter=verbose`

Fix any test failures related to AND/NOT/negated assertions. Remove tests that test AND or NOT behavior.

- [ ] **Step 6: Commit**

```bash
git add src/lib/queryParser.ts src/lib/querySerializer.ts
git commit -m "refactor(search): simplify parser to implicit OR, remove AND/NOT/negation"
```

---

## Task 2: Update Query Evaluator (remove AND/NOT/goldstein/vertical)

**Files:**
- Modify: `src/lib/queryEvaluator.ts`

- [ ] **Step 1: Update evaluateQuery to only handle OR/tag/text**

Remove `and` and `not` cases from the switch. The evaluator now only supports `or`, `tag`, and `text`. Remove the `negated` check from the `tag` case:

```typescript
export function evaluateQuery(
  node: QueryNode | null,
  entity: MapEntity | SiteEntity,
  context: EvaluationContext,
): boolean {
  if (!node) return true;

  switch (node.type) {
    case 'or':
      return evaluateQuery(node.left, entity, context) || evaluateQuery(node.right, entity, context);
    case 'tag':
      return evaluateTag(entity, node.prefix, node.value, context);
    case 'text': {
      const fields = getSearchableFields(entity);
      const lower = node.value.toLowerCase();
      return fields.some(f => f.includes(lower));
    }
  }
}
```

- [ ] **Step 2: Remove goldstein and vertical tag cases from evaluateTag**

Delete the `case 'goldstein'` block (lines 248-251), `case 'vertical'` block (lines 265-271), and `case 'squawk'` block (lines 335-338, was a no-op returning true).

- [ ] **Step 3: Run tests**

Run: `npx vitest run --reporter=verbose`

Fix any compile errors from removed types.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queryEvaluator.ts
git commit -m "refactor(search): update evaluator for OR-only, remove goldstein/vertical"
```

---

## Task 3: Update Tag Registry (remove goldstein/vertical/squawk, fix heading)

**Files:**
- Modify: `src/lib/tagRegistry.ts`
- Modify: `src/components/search/CheatSheet.tsx`

- [ ] **Step 1: Remove goldstein, vertical, squawk from TAG_REGISTRY**

Delete the `goldstein`, `vertical`, and `squawk` entries from the `TAG_REGISTRY` object.

Update the `heading` entry's `entityTypes` from `['ship']` to `['flight', 'ship']` (currently only lists ship, must add flight).

- [ ] **Step 2: Update CheatSheet TAG_GROUPS**

In `src/components/search/CheatSheet.tsx`, remove `squawk`, `vertical` from Flight group, and `goldstein` from Event group:

```typescript
const TAG_GROUPS = [
  {
    label: 'Cross-entity',
    prefixes: ['type', 'country', 'near', 'since', 'before', 'has'],
  },
  {
    label: 'Flight',
    prefixes: ['callsign', 'icao', 'altitude', 'speed', 'ground', 'heading', 'unidentified'],
  },
  {
    label: 'Ship',
    prefixes: ['mmsi', 'shipname'],
  },
  {
    label: 'Event',
    prefixes: ['actor', 'location', 'severity', 'cameo', 'mentions', 'date'],
  },
  {
    label: 'Site',
    prefixes: ['site', 'status'],
  },
] as const;
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tagRegistry.ts src/components/search/CheatSheet.tsx
git commit -m "refactor(search): remove goldstein/vertical/squawk from tag registry"
```

---

## Task 4: Extend FilterStore with new filter fields

**Files:**
- Modify: `src/stores/filterStore.ts`
- Modify: `src/types/ui.ts`
- Modify: `src/stores/uiStore.ts`

- [ ] **Step 1: Add new fields to filterStore**

Add these new fields to `FilterState` interface and `DEFAULTS`:

```typescript
// New text search fields
flightCallsign: string;
flightIcao: string;
shipMmsi: string;
shipNameFilter: string;
cameoCode: string;

// New range fields
mentionsMin: number | null;
mentionsMax: number | null;
headingAngle: number | null; // 0-360, null = no filter

// Severity toggles
showHighSeverity: boolean;
showMediumSeverity: boolean;
showLowSeverity: boolean;
```

Add corresponding setters:
```typescript
setFlightCallsign: (v: string) => void;
setFlightIcao: (v: string) => void;
setShipMmsi: (v: string) => void;
setShipNameFilter: (v: string) => void;
setCameoCode: (v: string) => void;
setMentionsRange: (min: number | null, max: number | null) => void;
setHeadingAngle: (v: number | null) => void;
setShowHighSeverity: (v: boolean) => void;
setShowMediumSeverity: (v: boolean) => void;
setShowLowSeverity: (v: boolean) => void;
```

Default values: text fields `''`, ranges `null`, severity toggles `true`.

Update `FilterKey` to include new keys: `'mentions' | 'heading' | 'callsign' | 'icao' | 'mmsi' | 'shipNameFilter' | 'cameo'`

Update `clearFilter` to handle new keys.

Update `activeFilterCount` to count new active filters.

- [ ] **Step 2: Remove savedToggles logic from setDateRange**

The date slider is now a normal filter. Remove the `savedToggles` field, `SavedToggles` interface, and all the auto-activate/auto-deactivate toggle suppression logic from `setDateRange`. The method becomes simply:

```typescript
setDateRange: (start, end) => set({ dateStart: start, dateEnd: end }),
```

Remove `isCustomRangeActive` (it referenced savedToggles). Remove `savedToggles` from `clearFilter('date')` handling. Remove the `SavedToggles` export.

- [ ] **Step 3: Add showHealthySites and showAttackedSites to uiStore**

In `src/types/ui.ts`, add to `LayerToggles`:
```typescript
showHealthySites: boolean;
showAttackedSites: boolean;
```

Defaults: both `true`.

In `src/stores/uiStore.ts`, add the new toggle state and actions:
```typescript
showHealthySites: initial.showHealthySites,
showAttackedSites: initial.showAttackedSites,
toggleHealthySites: () => {
  set((s) => ({ showHealthySites: !s.showHealthySites }));
  persistToggles(getToggles(get()));
},
toggleAttackedSites: () => {
  set((s) => ({ showAttackedSites: !s.showAttackedSites }));
  persistToggles(getToggles(get()));
},
```

Add to `UIState` interface and `getToggles` function.

- [ ] **Step 4: Run tests, fix compile errors**

Run: `npx vitest run src/__tests__/filterStore.test.ts src/__tests__/uiStore.test.ts --reporter=verbose`

- [ ] **Step 5: Commit**

```bash
git add src/stores/filterStore.ts src/types/ui.ts src/stores/uiStore.ts
git commit -m "feat(filter): add new filter fields, severity toggles, site health toggles"
```

---

## Task 5: Update entity filter predicate

**Files:**
- Modify: `src/lib/filters.ts`

- [ ] **Step 1: Add new filter predicates**

Add these new filter checks to `entityPassesFilters`:

```typescript
// ── Flight callsign filter ──
if (filters.flightCallsign) {
  if (entity.type === 'flight') {
    if (!entity.label.toLowerCase().includes(filters.flightCallsign.toLowerCase())) return false;
  }
}

// ── Flight ICAO filter ──
if (filters.flightIcao) {
  if (entity.type === 'flight') {
    if (!entity.data.icao24.toLowerCase().includes(filters.flightIcao.toLowerCase())) return false;
  }
}

// ── Ship MMSI filter ──
if (filters.shipMmsi) {
  if (entity.type === 'ship') {
    if (!String(entity.data.mmsi).includes(filters.shipMmsi)) return false;
  }
}

// ── Ship name filter ──
if (filters.shipNameFilter) {
  if (entity.type === 'ship') {
    if (!entity.data.shipName.toLowerCase().includes(filters.shipNameFilter.toLowerCase())) return false;
  }
}

// ── CAMEO code filter ──
if (filters.cameoCode) {
  if (isConflictEventType(entity.type)) {
    if (entity.data.cameoCode !== filters.cameoCode) return false;
  }
}

// ── Mentions range filter ──
if (filters.mentionsMin !== null || filters.mentionsMax !== null) {
  if (isConflictEventType(entity.type)) {
    const mentions = entity.data.numMentions ?? 0;
    if (filters.mentionsMin !== null && mentions < filters.mentionsMin) return false;
    if (filters.mentionsMax !== null && mentions > filters.mentionsMax) return false;
  }
}

// ── Heading filter (flight only, ±15° tolerance) ──
if (filters.headingAngle !== null) {
  if (entity.type === 'flight') {
    const heading = entity.data.heading;
    if (heading !== null && heading !== undefined) {
      const diff = Math.abs(((heading - filters.headingAngle + 180) % 360) - 180);
      if (diff > 15) return false;
    }
  }
}
```

- [ ] **Step 2: Remove ship speed filter**

The user spec for ships only includes: visibility button, MMSI search, ship name search. No speed. Remove the ship speed filter block from `src/lib/filters.ts` (lines 59-67 — the `shipSpeedMin/shipSpeedMax` block). Also remove `shipSpeedMin`, `shipSpeedMax`, `setShipSpeedRange`, and the `'shipSpeed'` FilterKey case from `filterStore.ts` (done in Task 4).

- [ ] **Step 3: Update useFilteredEntities to pass new fields**

In `src/hooks/useFilteredEntities.ts`, add new filter fields to the `useShallow` selector:

```typescript
flightCallsign: s.flightCallsign,
flightIcao: s.flightIcao,
shipMmsi: s.shipMmsi,
shipNameFilter: s.shipNameFilter,
cameoCode: s.cameoCode,
mentionsMin: s.mentionsMin,
mentionsMax: s.mentionsMax,
headingAngle: s.headingAngle,
```

Remove `shipSpeedMin` and `shipSpeedMax` from the selector.

Also remove the savedToggles-based custom range logic. The `isDefaultWindowActive` check for the 24h default window should remain (it applies to events when no date range is explicitly set).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/filters.test.ts --reporter=verbose`

- [ ] **Step 5: Commit**

```bash
git add src/lib/filters.ts src/hooks/useFilteredEntities.ts
git commit -m "feat(filter): add callsign/icao/mmsi/name/cameo/mentions/heading predicates"
```

---

## Task 6: Add severity classification and update entity layers

**Files:**
- Modify: `src/lib/severity.ts`
- Modify: `src/hooks/useEntityLayers.ts`

- [ ] **Step 0: Add time-independent severity classifier to severity.ts**

The existing `computeSeverityScore` uses `Date.now()` for recency decay, making it unsuitable for layer filtering (events would silently reclassify as time passes). Add a separate pure classifier that uses only type weight and mentions/sources — no recency decay:

```typescript
export type SeverityLevel = 'high' | 'medium' | 'low';

/** High/Medium/Low thresholds for the static score */
const HIGH_THRESHOLD = 50;
const MEDIUM_THRESHOLD = 15;

/**
 * Classify severity for filtering purposes (no recency decay).
 * Uses typeWeight * log2(1 + mentions) * log2(1 + sources).
 * This produces a stable classification that won't change over time.
 */
export function classifySeverity(event: ConflictEventEntity): SeverityLevel {
  const typeWeight = TYPE_WEIGHTS[event.type] ?? 3;
  const mentions = event.data.numMentions ?? 1;
  const sources = event.data.numSources ?? 1;
  const score = typeWeight * Math.log2(1 + mentions) * Math.log2(1 + sources);
  if (score > HIGH_THRESHOLD) return 'high';
  if (score > MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}
```

Export `HIGH_THRESHOLD` and `MEDIUM_THRESHOLD` as named constants so the evaluator in `queryEvaluator.ts` can import and reuse them (replaces the hardcoded 50/15 in the `severity:` case of `evaluateTag`).

- [ ] **Step 1: Add severity filtering to event layers**

Import the new classifier. After the toggle-based event filtering, add severity filtering:

```typescript
import { classifySeverity } from '@/lib/severity';
```

Add severity toggle subscriptions:
```typescript
const showHighSeverity = useFilterStore((s) => s.showHighSeverity);
const showMediumSeverity = useFilterStore((s) => s.showMediumSeverity);
const showLowSeverity = useFilterStore((s) => s.showLowSeverity);
```

Add a severity filter function:
```typescript
function passesSeverityFilter(event: ConflictEventEntity, high: boolean, med: boolean, low: boolean): boolean {
  const level = classifySeverity(event);
  if (level === 'high') return high;
  if (level === 'medium') return med;
  return low;
}
```

Apply to each event category (airstrikeEvents, groundCombatEvents, targetedEvents) by adding `.filter(e => passesSeverityFilter(e, showHighSeverity, showMediumSeverity, showLowSeverity))`.

- [ ] **Step 2: Add healthy/attacked site filtering**

Subscribe to new toggles:
```typescript
const showHealthySites = useUIStore((s) => s.showHealthySites);
const showAttackedSites = useUIStore((s) => s.showAttackedSites);
```

Update the `visibleSites` memo to also filter by health status:
```typescript
const visibleSites = useMemo(() => {
  let filtered = toggleFilteredSites;
  if (showHitOnly) {
    filtered = filtered.filter(s => siteAttackMap.get(s.id));
  }
  // Health status filter
  filtered = filtered.filter(s => {
    const attacked = siteAttackMap.get(s.id) ?? false;
    if (attacked) return showAttackedSites;
    return showHealthySites;
  });
  return filtered;
}, [toggleFilteredSites, showHitOnly, siteAttackMap, showHealthySites, showAttackedSites]);
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/__tests__/entityLayers.test.ts --reporter=verbose`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useEntityLayers.ts
git commit -m "feat(layers): add severity filtering for events, health filtering for sites"
```

---

## Task 7: Create reusable filter UI components

**Files:**
- Create: `src/components/filter/TextSearchInput.tsx`
- Create: `src/components/filter/HeadingSlider.tsx`
- Create: `src/components/filter/VisibilityButton.tsx`
- Create: `src/components/filter/SeverityToggles.tsx`

- [ ] **Step 1: Create TextSearchInput**

A compact text input for inline search fields (callsign, ICAO, MMSI, ship name, CAMEO):

```tsx
import { useId } from 'react';

interface TextSearchInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function TextSearchInput({ label, value, onChange, placeholder }: TextSearchInputProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-[10px] uppercase tracking-wider text-text-muted">{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? `Filter by ${label.toLowerCase()}...`}
        className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-secondary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
      />
    </div>
  );
}
```

- [ ] **Step 2: Create VisibilityButton**

A small toggle button that shows/hides an entity type:

```tsx
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
```

- [ ] **Step 3: Create SeverityToggles**

Three toggle buttons for Low/Medium/High severity:

```tsx
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
```

- [ ] **Step 4: Create HeadingSlider**

A single-thumb 0-360 degree slider:

```tsx
interface HeadingSliderProps {
  value: number | null;
  onChange: (v: number | null) => void;
}

export function HeadingSlider({ value, onChange }: HeadingSliderProps) {
  const angle = value ?? 0;
  const isActive = value !== null;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">Heading</span>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] text-text-secondary">
            {isActive ? `${angle}\u00B0` : '---'}
          </span>
          {isActive && (
            <button
              onClick={() => onChange(null)}
              className="text-[10px] text-text-muted hover:text-accent-red"
              aria-label="Clear heading filter"
            >
              x
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={360}
        step={5}
        value={angle}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-thumb h-5 w-full appearance-none bg-transparent"
        aria-label="Heading angle"
      />
      <div className="flex justify-between text-[8px] text-text-muted">
        <span>N</span><span>E</span><span>S</span><span>W</span><span>N</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/filter/TextSearchInput.tsx src/components/filter/HeadingSlider.tsx src/components/filter/VisibilityButton.tsx src/components/filter/SeverityToggles.tsx
git commit -m "feat(filter): create reusable filter UI components"
```

---

## Task 8: Redesign FilterPanelSlot with all new controls

**Files:**
- Modify: `src/components/layout/FilterPanelSlot.tsx`

- [ ] **Step 1: Rewrite FilterPanelContent**

Replace the entire `FilterPanelContent` with the new layout organized by entity type. Each entity section has:

**Conflicts section:**
- Visibility buttons: Airstrikes, Ground Combat, Targeted
- Severity toggles: High, Medium, Low (using `SeverityToggles` component)
- CAMEO search bar (using `TextSearchInput`)
- Country search bar — reuse existing `CountryFilter` component (`src/components/filter/CountryFilter.tsx`) wired to `eventCountries` in filterStore
- Mentions double-ended slider (using existing `RangeSlider` component)
- Date slider (no "live feeds paused" indicator, no savedToggles logic)

**Sites section:**
- Visibility buttons per type: Nuclear, Naval, Oil, Airbase, Desalination, Port
- Healthy toggle
- Attacked toggle
- Hit Only toggle (existing)

**Ships section:**
- Visibility button
- MMSI search bar
- Ship name search bar

**Flights section:**
- Visibility button
- Grounded toggle
- Unidentified toggle
- Callsign search bar
- ICAO search bar
- Altitude double-ended slider
- Speed double-ended slider
- Heading slider (single angle)

**Proximity section** (global, keep existing):
- Pin controls
- Radius slider

Wire all controls to their respective store actions. Import new components.

- [ ] **Step 2: Update DateRangeFilter**

In `src/components/filter/DateRangeFilter.tsx`, remove the `isCustomRangeActive` prop and the "Live feeds paused" indicator. The component becomes a simple date range slider without side effects.

Remove `isCustomRangeActive` from the props interface and the JSX that renders the amber warning.

- [ ] **Step 3: Remove the standalone FilterPanelSlot overlay**

The filter panel now only renders inside the Sidebar. Remove the `FilterPanelSlot` component export (or keep it delegating to Sidebar). Since the standalone floating panel at `top-14 right-4` is redundant with the sidebar, remove it.

Actually, check if FilterPanelSlot is used anywhere as a standalone overlay. Looking at the code, it IS exported and used. Let's keep it but update its content.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/FilterPanelSlot.tsx src/components/filter/DateRangeFilter.tsx
git commit -m "feat(filter): redesign filter panel with per-entity controls"
```

---

## Task 9: Rewrite useQuerySync for full bidirectional sync

**Files:**
- Modify: `src/hooks/useQuerySync.ts`

This is the most complex task. The sync must handle:

**Search -> Filters direction:**
When the user types a query, parse it and update filter controls:
- `type:flight` → enable showFlights visibility
- `type:airstrike` → enable showAirstrikes (wraps into group, not granular subtypes)
- `country:iran` → add to both flightCountries and eventCountries
- `since:6h` → update dateStart slider
- `before:24h` → update dateEnd slider
- `callsign:IRA` → set flightCallsign
- `icao:abc123` → set flightIcao
- `mmsi:123` → set shipMmsi
- `shipname:tanker` → set shipNameFilter
- `cameo:190` → set cameoCode
- `altitude:>10000` → set altitudeMin/Max
- `speed:>200` → set flightSpeedMin/Max
- `heading:90` → set headingAngle
- `severity:high` → enable showHighSeverity (disable others)
- `mentions:>50` → set mentionsMin
- `site:nuclear` → enable showNuclear
- `status:healthy` → enable showHealthySites
- `status:attacked` → enable showAttackedSites
- `ground:true` → enable showGroundTraffic
- `unidentified:true` → enable pulseEnabled
- `near:natanz` → set proximityPin (lookup site coordinates)
- `has:callsign` → smart: set relevant entity filter
- `actor:iran` → set eventCountries

**Filters -> Search direction:**
When filter controls change, rebuild the search query:
- Each active filter generates a corresponding tag in the query
- Non-filter tags (free text) are preserved

- [ ] **Step 1: Update extractTags to work without negated**

Remove `negated` from the returned tag objects. Remove NOT handling.

- [ ] **Step 2: Update deriveTogglesFromAST**

Remove all negation logic. Remove wildcard (*) handling for negated tags. Simplify to: each `type:X` tag enables its toggle, each `site:X` tag enables its toggle.

- [ ] **Step 3: Update deriveFiltersFromAST**

Add new filter derivations for:
- `callsign:` → flightCallsign
- `icao:` → flightIcao
- `mmsi:` → shipMmsi
- `shipname:` → shipNameFilter
- `cameo:` → cameoCode
- `mentions:` → mentionsMin/Max
- `heading:` → headingAngle
- `severity:` → severity toggles
- `near:` → proximityPin (requires site lookup)
- `actor:` → eventCountries
- `country:` → **BOTH** `flightCountries` AND `eventCountries` (fix existing bug: currently only syncs to flightCountries)

The existing `deriveFiltersFromAST` sets `result.countries` which only maps to `setFlightCountries`. Fix this by having the search→filter sync set BOTH:
```typescript
if (filterUpdates.countries !== undefined) {
  useFilterStore.getState().setFlightCountries(filterUpdates.countries);
  useFilterStore.getState().setEventCountries(filterUpdates.countries);
}
```

- [ ] **Step 4: Rename buildAndChain to buildOrChain and update buildASTFromToggles**

The existing `buildAndChain` function creates `{ type: 'and', ... }` nodes which no longer exist in the AST. Rename to `buildOrChain` and use `{ type: 'or', ... }`:

```typescript
function buildOrChain(nodes: QueryNode[]): QueryNode | null {
  if (nodes.length === 0) return null;
  let result = nodes[0];
  for (let i = 1; i < nodes.length; i++) {
    result = { type: 'or', left: result, right: nodes[i] };
  }
  return result;
}
```

Update `buildASTFromToggles` to call `buildOrChain` instead of `buildAndChain`.

Add new syncable state fields. Generate tags from:
- All text search fields (callsign, icao, mmsi, shipname, cameo)
- All range fields (altitude, speed, mentions, heading)
- All boolean toggles
- All visibility toggles

- [ ] **Step 5: Update extractNonSyncedNodes and SyncableState**

`extractNonSyncedNodes` determines which AST nodes are "synced" (rebuilt from toggle/filter state) vs "non-synced" (preserved as-is). After adding the new filter fields, ALL tag prefixes are now synced. Update `extractNonSyncedNodes` to treat these additional prefixes as synced:

```typescript
const SYNCED_PREFIXES = new Set([
  'type', 'site', 'country', 'since', 'before',
  'ground', 'unidentified', 'status',  // boolean tags
  'altitude', 'speed',                 // existing range tags
  'callsign', 'icao', 'mmsi', 'shipname', 'cameo',  // new text tags
  'mentions', 'heading',               // new range tags
  'severity',                          // severity toggles
  'actor',                             // actor → eventCountries
  'near',                              // proximity pin
]);

function extractNonSyncedNodes(node: QueryNode | null): QueryNode[] {
  if (!node) return [];
  switch (node.type) {
    case 'tag':
      return SYNCED_PREFIXES.has(node.prefix.toLowerCase()) ? [] : [node];
    case 'text':
      return [node];
    case 'or':
      return [...extractNonSyncedNodes(node.left), ...extractNonSyncedNodes(node.right)];
  }
}
```

Add all new filter fields to `SyncableState` interface.

- [ ] **Step 6: Update the useQuerySync hook effects**

Add subscriptions to new filter store fields. Wire up the new filter → search and search → filter pathways.

- [ ] **Step 7: Run tests**

Run: `npx vitest run --reporter=verbose`

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useQuerySync.ts
git commit -m "feat(sync): rewrite useQuerySync for full bidirectional search-filter sync"
```

---

## Task 10: Update SearchModal and SearchStore

**Files:**
- Modify: `src/stores/searchStore.ts`
- Modify: `src/components/search/SearchModal.tsx`
- Modify: `src/hooks/useSearchResults.ts`
- Modify: `src/hooks/useAutocomplete.ts`

- [ ] **Step 1: Simplify searchStore**

Remove `isFilterMode` — search is always synced with filters. The `applyAsFilter` action becomes unnecessary since syncing happens automatically. Remove `matchedIds` tracking — the filter panel is now the authority.

Actually, we still need `matchedIds` for the entity layer dimming when search is active. Keep `matchedIds` and `isFilterMode` but rename the concept: whenever there's a non-empty query, it's "active". The `applyAsFilter` can be simplified to just close the modal (search is always live).

Simplify `applyAsFilter`:
```typescript
applyAsFilter: () => {
  const { parsedQuery, recentTags } = get();
  const tagExprs = extractTagExpressions(parsedQuery);
  const merged = [...new Set([...tagExprs, ...recentTags])].slice(0, MAX_RECENT_TAGS);
  persistRecentTags(merged);
  set({ isFilterMode: true, isSearchModalOpen: false, recentTags: merged });
},
```

Remove `not` from `extractTagExpressions` — it only handles `tag`, `text`, `or` now.

- [ ] **Step 2: Update SearchModal**

In the Enter key handler, simplify — the search always syncs, so Enter just closes the modal and marks as filter mode.

Remove any references to `negated` in autocomplete suggestion handling.

- [ ] **Step 3: Update useAutocomplete**

Remove the `AND`/`OR` keyword skip (line 99). Actually, keep `OR` skip since OR is still a keyword. Remove just `AND`:

```typescript
if (word === 'OR') return [];
```

- [ ] **Step 4: Update useSearchResults**

Remove `and` and `not` from `extractTagExpressions` in searchStore.ts (already done via parser changes). The evaluator already handles the simplified AST.

- [ ] **Step 5: Commit**

```bash
git add src/stores/searchStore.ts src/components/search/SearchModal.tsx src/hooks/useSearchResults.ts src/hooks/useAutocomplete.ts
git commit -m "feat(search): simplify search store and modal for always-synced behavior"
```

---

## Task 11: Update useCounterData and LayerTogglesSlot

**Files:**
- Modify: `src/components/counters/useCounterData.ts`
- Modify: `src/components/layout/LayerTogglesSlot.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update useCounterData**

Add severity-based counter subdivisions if desired. At minimum, ensure counters still work with the new severity toggles — events not passing severity filter should not be counted.

Import severity score computation and filter store:
```typescript
const showHighSeverity = useFilterStore((s) => s.showHighSeverity);
const showMediumSeverity = useFilterStore((s) => s.showMediumSeverity);
const showLowSeverity = useFilterStore((s) => s.showLowSeverity);
```

Filter events by severity before counting.

- [ ] **Step 2: Update LayerTogglesSlot**

Remove the `customRangeLock` (savedToggles-based disabling) since date range no longer suppresses toggles. All toggle rows are always enabled:

```typescript
// Remove this line:
const customRangeLock = useFilterStore((s) => s.savedToggles !== null);
```

Remove all `disabled={customRangeLock}` props.

Add the new site health toggles to LayerTogglesContent:
```tsx
<ToggleRow color="#22c55e" label="Healthy" active={showHealthySites} onToggle={toggleHealthySites} indent disabled={!showSites} />
<ToggleRow color="#f97316" label="Attacked" active={showAttackedSites} onToggle={toggleAttackedSites} indent disabled={!showSites} />
```

- [ ] **Step 3: Update Sidebar**

Make sure the Sidebar filter section renders the updated FilterPanelContent correctly. Remove references to `savedToggles` if any.

- [ ] **Step 4: Run tests**

Run: `npx vitest run --reporter=verbose`

- [ ] **Step 5: Commit**

```bash
git add src/components/counters/useCounterData.ts src/components/layout/LayerTogglesSlot.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(ui): update counters, layer toggles, and sidebar for new filter system"
```

---

## Task 12: Fix all tests

**Files:**
- Modify: `src/__tests__/searchStore.test.ts`
- Modify: `src/__tests__/filterStore.test.ts`
- Modify: `src/__tests__/uiStore.test.ts`
- Modify: `src/__tests__/filters.test.ts`
- Modify: `src/__tests__/FilterPanel.test.tsx`
- Modify: `src/__tests__/SearchModal.test.tsx`
- Modify: `src/__tests__/useCounterData.test.ts`
- Modify: `src/__tests__/CountersSlot.test.tsx`
- Modify: `src/__tests__/entityLayers.test.ts`

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run --reporter=verbose`

Collect all failures.

- [ ] **Step 2: Fix test failures**

For each failing test:
1. If it tests AND/NOT/negation behavior → remove the test
2. If it tests goldstein/vertical/squawk → remove the test
3. If it tests savedToggles/custom range toggle suppression → remove the test
4. If it references removed types (AndNode, NotNode, negated) → update the type references
5. If it tests filter logic with removed fields (shipSpeed) → update or remove
6. Add new tests for:
   - OR-only parsing: `"type:flight type:ship"` parses as OR chain
   - New filter fields (callsign, icao, mmsi, shipName, cameo, mentions, heading)
   - Severity toggle filtering
   - Site healthy/attacked toggles

- [ ] **Step 3: Run full test suite again**

Run: `npx vitest run --reporter=verbose`

All tests should pass.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/
git commit -m "test(search): update tests for simplified search and new filter system"
```

---

## Task 13: Build and typecheck

- [ ] **Step 1: Run TypeScript typecheck**

Run: `npx tsc --noEmit`

Fix any type errors.

- [ ] **Step 2: Run full build**

Run: `npm run build`

Fix any build errors.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type errors and build issues from search-filter unification"
```

---

## Summary of Removals

- **AND operator** — removed from parser, tokenizer
- **NOT operator / negation (!)** — removed from parser, tokenizer, evaluator
- **`goldstein:` tag** — removed from evaluator, registry, cheat sheet
- **`vertical:` tag** — removed from evaluator, registry, cheat sheet
- **`squawk:` tag** — removed from registry, cheat sheet (was no-op anyway)
- **`savedToggles`** — removed from filterStore (date range is a normal filter now)
- **`shipSpeedMin/Max`** — removed from filterStore (ships only get mmsi + name filters)
- **Custom range toggle suppression** — removed (date slider doesn't pause live feeds)

## Summary of Additions

- **Severity toggles** — `showHighSeverity`, `showMediumSeverity`, `showLowSeverity` in filterStore
- **Site health toggles** — `showHealthySites`, `showAttackedSites` in uiStore
- **Text search filters** — `flightCallsign`, `flightIcao`, `shipMmsi`, `shipNameFilter`, `cameoCode` in filterStore
- **Mentions range** — `mentionsMin`, `mentionsMax` in filterStore
- **Heading angle** — `headingAngle` in filterStore
- **New UI components** — `TextSearchInput`, `HeadingSlider`, `VisibilityButton`, `SeverityToggles`
- **Full bidirectional sync** — every filter control syncs to search bar and vice versa
