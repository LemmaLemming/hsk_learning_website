# Agent Instructions: Fix Large Vocabulary Set Crash

**Repo root:** `C:\Users\YRDAM\Documents\GitHub\hsk_learning_website`  
**Frontend root:** `C:\Users\YRDAM\Documents\GitHub\hsk_learning_website\frontend`  
**Build command:** `npm run build` (run from `frontend/`)  
**Dev server:** `npm run dev` (run from `frontend/`)

---

## Context

This is a Vite + React 19 + TypeScript + Firebase app for studying HSK Chinese vocabulary.  
Users create "vocab sets" containing VocabItem references (level + vocabId + status). When studying, items are hydrated with static JSON data from `frontend/public/data/{1-7}.min.json`.

### The Problem

The **SetDetail** (study view) page crashes or freezes when a vocab set is large (1,000+ items). The three operations that trigger it most severely are **Shuffle**, **Add vocab**, and **Split into daily decks**. There are three compounding root causes:

1. **`getVocabById()` uses `.find()` — O(n*m) hydration.** Each call linearly scans the level's full vocab array. A 5,000-item set from level 7 (4,876 entries) does ~24 million comparisons.
2. **Autosave change detection uses `JSON.stringify` of the entire items array.** This runs on every render after a state change, allocating multi-MB strings.
3. **Every vocab card is a `<Draggable>` DOM node.** Shuffling destroys and recreates all 5,000+ wrappers.

### The Fix (3 parts)

- **Fix A:** Build a `Map<number, VocabEntry>` index in `vocabLoader.ts` so `getVocabById` is O(1).
- **Fix B:** Replace `JSON.stringify` autosave key with an incrementing version counter.
- **Fix C:** Paginate the card list. Add `pageSize` to user preferences (stored in Firestore). Enforce a max subset size of 100 to prevent DOM explosion.

---

## Tech Stack Reference

| Tool | Version | Notes |
|---|---|---|
| React | 19.2.8 | Uses `react-jsx` transform (no `import React`) |
| TypeScript | 6.0.2 | `verbatimModuleSyntax: true` — use `import type` for type-only imports |
| Vite | 8.2.2 | Dev server on port 5173 |
| Firebase | 12.18.0 | Firestore, Auth |
| @hello-pangea/dnd | 18.0.1 | React 19 fork of react-beautiful-dnd |
| react-router-dom | 7.18.2 | |

### TypeScript rules
- `noUnusedLocals: true` — no unused imports or variables allowed.
- `noUnusedParameters: true` — prefix unused params with `_`.
- `erasableSyntaxOnly: true` — no `enum`, use `as const` arrays instead.
- `verbatimModuleSyntax: true` — you MUST use `import type { X }` for types.

### Firestore rules
- Located at `firestore.rules` in repo root.
- User docs live at `users/{userId}`, sets at `users/{userId}/sets/{setId}`.
- `updateDoc` sends partial data — Firestore rules validate `request.resource.data` (the full resulting document after merge). The `isValidUserDoc()` function uses `data.keys().hasOnly(...)` so any new field MUST be added to that whitelist.
- The rules are already deployed. After modifying them, deploy with: `npx -y firebase-tools@latest deploy --only firestore:rules`

### Existing patterns
- State mutations use React `useState` setters with functional updates: `setItems(prev => ...)`.
- All `useEffect` hooks use an `active` flag for stale-closure prevention.
- The app uses a retro early-2000s visual theme. Buttons use class `retro-btn`, inputs use `retro-input`, layouts use `<fieldset>`/`<legend>`. No border-radius anywhere. Font is VT323 mono for headings/UI, Georgia serif for body.

---

## File Map

All paths relative to `frontend/src/`:

| File | Purpose |
|---|---|
| `types/index.ts` | All shared TypeScript types/interfaces |
| `services/vocabLoader.ts` | Loads and caches static JSON vocab data; provides `getVocabById()` |
| `hooks/useVocabData.ts` | React hook wrapping `vocabLoader.loadLevels()` |
| `hooks/useAutosave.ts` | Debounced autosave hook |
| `services/setService.ts` | Firestore CRUD for vocab sets |
| `services/userService.ts` | Firestore CRUD for user preferences |
| `pages/SetDetail.tsx` | Study view — the page that crashes |
| `components/VocabCard.tsx` | Individual vocab card component |
| `components/GlobalSettings.tsx` | Settings modal (character type, visible fields) |
| `pages/SetList.tsx` | Dashboard — hosts the settings modal |
| `style.css` | All CSS |

---

## Fix A: Indexed Vocab Lookup

### File: `frontend/src/services/vocabLoader.ts`

**Current code (entire file):**

```typescript
import type { VocabEntry } from "../types";

const cache = new Map<number, VocabEntry[]>();

export async function loadLevel(level: number): Promise<VocabEntry[]> {
  const cached = cache.get(level);
  if (cached) return cached;
  const res = await fetch(`/data/${level}.min.json`);
  if (!res.ok) {
    throw new Error(`Failed to load level ${level}: HTTP ${res.status}`);
  }
  const data = (await res.json()) as VocabEntry[];
  cache.set(level, data);
  return data;
}

export async function loadLevels(
  levels: number[]
): Promise<Map<number, VocabEntry[]>> {
  const unique = [...new Set(levels)];
  await Promise.all(unique.map(loadLevel));
  return cache;
}

export function getVocabById(
  level: number,
  id: number
): VocabEntry | undefined {
  return cache.get(level)?.find((e) => e.id === id);
}

export function getCacheLevel(level: number): VocabEntry[] | undefined {
  return cache.get(level);
}
```

**Changes to make:**

1. Add a secondary index cache: `const indexCache = new Map<number, Map<number, VocabEntry>>();`
2. After loading a level into `cache`, also build the index:
   ```typescript
   function buildIndex(level: number, entries: VocabEntry[]): void {
     const map = new Map<number, VocabEntry>();
     for (const e of entries) map.set(e.id, e);
     indexCache.set(level, map);
   }
   ```
3. Call `buildIndex(level, data)` inside `loadLevel` right after `cache.set(level, data)`.
4. Replace `getVocabById` body:
   ```typescript
   export function getVocabById(level: number, id: number): VocabEntry | undefined {
     return indexCache.get(level)?.get(id);
   }
   ```

**Do NOT change** `loadLevels`, `getCacheLevel`, or any function signatures.

---

## Fix B: Version Counter Autosave

### File: `frontend/src/pages/SetDetail.tsx`

**Current problematic code (line 173):**
```typescript
const saveKey = JSON.stringify({ name, items, shuffled, subsetSize });
```

**Changes to make:**

1. Add a version state near the other state declarations (around line 35):
   ```typescript
   const [version, setVersion] = useState(0);
   ```
   
2. Create a bump helper:
   ```typescript
   const bump = () => setVersion((v) => v + 1);
   ```

3. Replace line 173:
   ```typescript
   const saveKey = `${name}:${shuffled}:${subsetSize}:${version}`;
   ```

4. Add `bump()` call inside each mutation function:
   - `cycleStatus` — after `setItems(...)` call (line 105-109), add `bump();`
   - `removeItem` — after `setItems(...)` call (line 112-115), add `bump();`
   - `handleShuffle` — after `setItems(...)` call (line 120-127), add `bump();`
   - `applySubset` — after `setSubsetSize(...)` call (line 132), add `bump();`
   - `addItems` — after `setItems(...)` call (line 137), add `bump();`
   - `handleDragEnd` — after `setItems(...)` call (line 155-169), add `bump();`

**Important:** The `bump()` call goes AFTER the `setItems`/`setSubsetSize` call in each function, on a new line. Do not replace or modify the existing state setter calls.

---

## Fix C: Pagination + Page Size Setting

This is the most involved change. It touches 5 files.

### C.1: Add `pageSize` to types

**File:** `frontend/src/types/index.ts`

**Current `UserPreferences` interface (lines 60-70):**
```typescript
export interface UserPreferences {
  displayName: string;
  characterType: CharacterType;
  visibleFields: VisibleField[];
  // New: onboarding fields
  onboardingComplete: boolean; // default: false
  occupation: Occupation | null; // default: null
  targetLevels: number[]; // default: [] (HSK levels 1-7)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Add `pageSize` field:**
```typescript
export interface UserPreferences {
  displayName: string;
  characterType: CharacterType;
  visibleFields: VisibleField[];
  pageSize: number; // default: 50, valid values: 10, 25, 50, 100
  // New: onboarding fields
  onboardingComplete: boolean; // default: false
  occupation: Occupation | null; // default: null
  targetLevels: number[]; // default: [] (HSK levels 1-7)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Also add a constant for the allowed page sizes after the existing `DEFAULT_VISIBLE_FIELDS` constant:
```typescript
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
```

### C.2: Update userService defaults and migration

**File:** `frontend/src/services/userService.ts`

**Add `pageSize` import** — update the import from types to include `PageSize`:
```typescript
import {
  DEFAULT_VISIBLE_FIELDS,
  type CharacterType,
  type Occupation,
  type PageSize,
  type UserPreferences,
  type VisibleField,
} from "../types";
```

**Add `pageSize` to `UserPrefUpdate` interface (around line 24):**
```typescript
export interface UserPrefUpdate {
  characterType?: CharacterType;
  visibleFields?: VisibleField[];
  pageSize?: PageSize;
  onboardingComplete?: boolean;
  occupation?: Occupation | null;
  targetLevels?: number[];
}
```

**Add `pageSize` to the migration check** in `getOrCreateUserDoc` (line 42). The existing check is:
```typescript
if (data.onboardingComplete == null || data.occupation === undefined || data.targetLevels === undefined) {
```
Change to:
```typescript
if (data.onboardingComplete == null || data.occupation === undefined || data.targetLevels === undefined || data.pageSize === undefined) {
```

And in the `migrated` object, add:
```typescript
pageSize: data.pageSize ?? 50,
```

**Add `pageSize: 50` to the `defaults` object** (around line 54-65):
```typescript
const defaults: UserPreferences = {
  displayName: user.displayName ?? user.email ?? "User",
  characterType: "simplified",
  visibleFields: DEFAULT_VISIBLE_FIELDS,
  pageSize: 50,
  onboardingComplete: false,
  occupation: null,
  targetLevels: [],
  createdAt: now(),
  updatedAt: now(),
};
```

### C.3: Update Firestore rules

**File:** `firestore.rules` (repo root)

In the `isValidUserDoc` function, add `'pageSize'` to the `keys().hasOnly()` list and add validation.

**Current (lines 64-78):**
```
function isValidUserDoc(data) {
  return data.keys().hasOnly(
      ['displayName', 'characterType', 'visibleFields', 'onboardingComplete',
       'occupation', 'targetLevels', 'createdAt', 'updatedAt'])
    && data.displayName is string
    && data.displayName.size() >= 1
    && data.displayName.size() <= 100
    && isCharacterType(data.characterType)
    && data.visibleFields is list
    && data.visibleFields.size() <= 10
    && data.onboardingComplete is bool
    && (data.occupation == null
        || data.occupation in ['student', 'working', 'professional', 'teacher', 'other'])
    && data.targetLevels is list
    && data.targetLevels.size() <= 7;
}
```

**Change to:**
```
function isValidUserDoc(data) {
  return data.keys().hasOnly(
      ['displayName', 'characterType', 'visibleFields', 'pageSize',
       'onboardingComplete', 'occupation', 'targetLevels', 'createdAt', 'updatedAt'])
    && data.displayName is string
    && data.displayName.size() >= 1
    && data.displayName.size() <= 100
    && isCharacterType(data.characterType)
    && data.visibleFields is list
    && data.visibleFields.size() <= 10
    && data.pageSize is int
    && data.pageSize in [10, 25, 50, 100]
    && data.onboardingComplete is bool
    && (data.occupation == null
        || data.occupation in ['student', 'working', 'professional', 'teacher', 'other'])
    && data.targetLevels is list
    && data.targetLevels.size() <= 7;
}
```

Also update the data model comment at the top of the rules file. Add `pageSize` to the Fields list:
```
//   - pageSize: int enum [10, 25, 50, 100] (required, default 50)
```

### C.4: Add page size to GlobalSettings

**File:** `frontend/src/components/GlobalSettings.tsx`

**Changes to make:**

1. **Update imports** to also import `PAGE_SIZES` and `PageSize`:
   ```typescript
   import {
     ALL_VISIBLE_FIELDS,
     PAGE_SIZES,
     type CharacterType,
     type PageSize,
     type UserPreferences,
     type VisibleField,
   } from "../types";
   ```

2. **Update `Props` interface** — the `onSave` callback must also include `pageSize`:
   ```typescript
   interface Props {
     prefs: UserPreferences;
     onSave: (prefs: {
       characterType: CharacterType;
       visibleFields: VisibleField[];
       pageSize: PageSize;
     }) => Promise<void> | void;
   }
   ```

3. **Add `pageSize` state** inside the component, after the existing state declarations:
   ```typescript
   const [pageSize, setPageSize] = useState<PageSize>(
     (PAGE_SIZES as readonly number[]).includes(prefs.pageSize)
       ? (prefs.pageSize as PageSize)
       : 50
   );
   ```

4. **Update `handleSave`** to include `pageSize`:
   ```typescript
   await onSave({ characterType, visibleFields, pageSize });
   ```

5. **Add a new setting group** in the JSX, BEFORE the Save button, AFTER the "Visible fields" section:
   ```tsx
   <div className="setting-group">
     <label className="setting-label">Cards per page</label>
     <div className="toggle-row">
       {PAGE_SIZES.map((size) => (
         <button
           key={size}
           className={`btn ${pageSize === size ? "active" : ""}`}
           onClick={() => {
             setSaved(false);
             setPageSize(size);
           }}
         >
           {size}
         </button>
       ))}
     </div>
   </div>
   ```

### C.5: Update SetList.tsx (dashboard) — pass pageSize through onSave

**File:** `frontend/src/pages/SetList.tsx`

**Current `handleSaveSettings` (lines 89-96):**
```typescript
const handleSaveSettings = async (p: {
  characterType: CharacterType;
  visibleFields: VisibleField[];
}) => {
  if (!user) return;
  await updateUserPreferences(user.uid, p);
  setPrefs((prev) => (prev ? { ...prev, ...p } : prev));
};
```

**Change the type signature to include `pageSize`:**

Add `PageSize` to the imports from `"../types"`:
```typescript
import type {
  CharacterType,
  PageSize,
  UserPreferences,
  VisibleField,
} from "../types";
```

Update the handler:
```typescript
const handleSaveSettings = async (p: {
  characterType: CharacterType;
  visibleFields: VisibleField[];
  pageSize: PageSize;
}) => {
  if (!user) return;
  await updateUserPreferences(user.uid, p);
  setPrefs((prev) => (prev ? { ...prev, ...p } : prev));
};
```

### C.6: Paginate SetDetail.tsx + enforce subset cap

**File:** `frontend/src/pages/SetDetail.tsx`

This is the main change. You are modifying the existing component, NOT rewriting it.

#### State additions (add near line 41, after existing state declarations):

```typescript
const [page, setPage] = useState(0);
```

#### Read pageSize from prefs (derived value, add after prefs state):

```typescript
const pageSize = prefs?.pageSize ?? 50;
```

#### Enforce subset size cap of 100

In the `applySubset` function (currently lines 130-133):

**Current:**
```typescript
const applySubset = () => {
  const n = parseInt(subsetInput, 10);
  setSubsetSize(Number.isFinite(n) && n > 0 ? n : null);
};
```

**Replace with:**
```typescript
const applySubset = () => {
  const n = parseInt(subsetInput, 10);
  if (!Number.isFinite(n) || n <= 0) {
    setSubsetSize(null);
  } else {
    setSubsetSize(Math.min(n, 100));
  }
  bump();
};
```

Note: `bump()` was already added in Fix B. Make sure there is only one `bump()` call in `applySubset`, not two.

Also update the subset size input to show the cap:

```tsx
<input
  id="subset-size"
  type="number"
  min={1}
  max={100}
  placeholder="10"
  value={subsetInput}
  onChange={(e) => setSubsetInput(e.target.value)}
/>
```

#### Pagination logic — add after the `subsets` useMemo (after line 199):

```typescript
// How many subsets to show per page
const subsetsPerPage = useMemo(() => {
  if (!subsetSize || subsetSize <= 0) {
    // No daily decks — paginate by pageSize (individual cards)
    return 1; // single "deck" paginated internally
  }
  if (pageSize < subsetSize) {
    // Exception: page size smaller than deck size -> 1 deck per page
    return 1;
  }
  return Math.floor(pageSize / subsetSize);
}, [pageSize, subsetSize]);

// Total pages
const totalPages = useMemo(() => {
  if (!subsetSize || subsetSize <= 0) {
    // Paginating individual cards within the single "deck"
    return Math.max(1, Math.ceil(filteredHydrated.length / pageSize));
  }
  return Math.max(1, Math.ceil(subsets.length / subsetsPerPage));
}, [subsets.length, subsetsPerPage, subsetSize, filteredHydrated.length, pageSize]);

// The visible subsets for the current page
const visibleSubsets = useMemo(() => {
  if (!subsetSize || subsetSize <= 0) {
    // Single virtual "deck" — slice the cards by page
    const start = page * pageSize;
    const end = start + pageSize;
    return [filteredHydrated.slice(start, end)];
  }
  const start = page * subsetsPerPage;
  const end = start + subsetsPerPage;
  return subsets.slice(start, end);
}, [subsets, page, subsetsPerPage, subsetSize, filteredHydrated, pageSize]);
```

#### Reset page to 0 when filter/subset/shuffle changes

Add this after the pagination logic:

```typescript
// Reset to page 0 when data shape changes
useEffect(() => {
  setPage(0);
}, [filter, subsetSize, shuffled]);
```

#### Update the rendering — replace `subsets` with `visibleSubsets`

In the JSX, find the section that maps over `subsets` (around lines 296-364). Replace the reference to `subsets` in the rendering:

**Current (line 296):**
```tsx
{!vocabLoading && subsets.length > 0 && (
```
**Change to:**
```tsx
{!vocabLoading && filteredHydrated.length > 0 && (
```

**Current (line 299):**
```tsx
{subsets.map((subset, idx) => (
```
**Change to:**
```tsx
{visibleSubsets.map((subset, idx) => (
```

**Current legend text (lines 302-306) — update deck numbering to account for page offset:**
```tsx
{subsets.length > 1
  ? `Day ${idx + 1} (${subset.length} word${...})`
  : `All words (${subset.length})`}
```
**Change to:**
```tsx
{subsetSize && subsetSize > 0
  ? `Day ${page * subsetsPerPage + idx + 1} (${subset.length} word${
      subset.length === 1 ? "" : "s"
    })`
  : `Showing ${subset.length} of ${filteredHydrated.length} word${
      filteredHydrated.length === 1 ? "" : "s"
    }`}
```

**Current droppableId (line 308):**
```tsx
<Droppable droppableId={`deck-${idx}`}>
```
**Change to (account for page offset so IDs stay unique):**
```tsx
<Droppable droppableId={`deck-${page * subsetsPerPage + idx}`}>
```

#### Add pagination controls — add AFTER the closing `</DragDropContext>` tag, still inside the loaded block (`<>...</>`):

```tsx
{totalPages > 1 && (
  <div className="pagination-controls">
    <button
      className="retro-btn"
      disabled={page === 0}
      onClick={() => setPage((p) => Math.max(0, p - 1))}
    >
      [ &lt;&lt; Prev ]
    </button>
    <span className="page-indicator">
      Page {page + 1} of {totalPages}
    </span>
    <button
      className="retro-btn"
      disabled={page >= totalPages - 1}
      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
    >
      [ Next &gt;&gt; ]
    </button>
  </div>
)}
```

#### Fix the drag-and-drop handler for page-aware deck index

The current `handleDragEnd` extracts deck index from the droppableId. Since we changed the droppableId to include the page offset, the handler needs updating.

**Current (line 144):**
```typescript
const deckIdx = Number(result.source.droppableId.replace("deck-", ""));
const deck = subsets[deckIdx];
```

**Change to:**
```typescript
const globalDeckIdx = Number(result.source.droppableId.replace("deck-", ""));
const localDeckIdx = globalDeckIdx - page * subsetsPerPage;
const deck = visibleSubsets[localDeckIdx];
```

### C.7: Add pagination CSS

**File:** `frontend/src/style.css`

Add at the end of the "SET DETAIL (STUDY VIEW)" section (after the `.remove-link` block, around line 763, BEFORE the "ADD VOCAB MODAL" section comment on line 765):

```css
/* ---------- PAGINATION ---------- */
.pagination-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 16px 0;
  font-family: var(--font-mono);
}

.page-indicator {
  font-size: 15px;
  color: var(--text-dim);
}
```

---

## Verification Checklist

After all changes are made, run these checks in order:

1. **TypeScript build:**
   ```
   cd frontend && npm run build
   ```
   Must exit with code 0 and zero TS errors.

2. **Firestore rules deploy:**
   ```
   npx -y firebase-tools@latest deploy --only firestore:rules
   ```
   Must compile and deploy successfully.

3. **Dev server smoke test:**
   ```
   cd frontend && npm run dev
   ```
   Must start without errors.

4. **Commit the changes:**
   ```
   git add -A
   git commit -m "Fix large-set crash: indexed lookup, version-counter autosave, paginated study view with configurable page size"
   ```

---

## IMPORTANT RULES

1. **Do NOT delete or rename any existing files.**
2. **Do NOT change any function signatures** in `setService.ts`, `vocabLoader.ts` (except `getVocabById` body), or `useAutosave.ts`.
3. **Do NOT remove any existing comments or docstrings** that are unrelated to your changes.
4. **Do NOT add any new npm dependencies.** All changes use existing libraries.
5. **Use `import type` for type-only imports** (TypeScript verbatimModuleSyntax requirement).
6. **The app uses a retro early-2000s theme.** All new UI elements must use the existing CSS classes (`retro-btn`, `retro-input`, etc.) and the monospace font (`var(--font-mono)`). No border-radius. No modern UI patterns (no tooltips, no floating labels, no glassmorphism).
7. **Test the build before committing.** `npm run build` from `frontend/` must pass with zero errors.
8. **Deploy firestore rules after modifying them.** Use `npx -y firebase-tools@latest deploy --only firestore:rules` from the repo root.
