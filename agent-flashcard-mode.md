# Agent Instructions: Flashcard Mode, Last-Page Memory & Dashboard Days Learnt

**Repo root:** `C:\Users\YRDAM\Documents\GitHub\hsk_learning_website`  
**Frontend root:** `C:\Users\YRDAM\Documents\GitHub\hsk_learning_website\frontend`  
**Build command:** `npm run build` (run from `frontend/`)  
**Dev server:** `npm run dev` (run from `frontend/`)  
**Firebase rules deploy:** `npx -y firebase-tools@latest deploy --only firestore:rules` (run from repo root)

---

## Overview of All Changes

1. **Last-page memory** — when a split set is in flashcard mode, persist `lastDeckPage` to Firestore so the user resumes on the correct day when they return.
2. **Flashcard mode** — when a set has been split into daily decks, the pagination now shows ONE deck per page as a Quizlet-style stacked flashcard experience:
   - Cards stack on top of each other (only top card visible).
   - Click the card → it flips (CSS 3D transform) to show the back side.
   - After flip, status buttons appear (Learnt / Skip / Unlearned).
   - After a status is set, the next card rises to the top automatically.
   - **Unlearned cards** cycle to the bottom of the current deck until all are learnt.
   - **Skip cascade algorithm** — skipping a card makes the deck 1 shorter; pull the first card from the next deck into this one to keep all decks uniform. This cascade continues to every subsequent deck.
3. **Front/back field configuration in GlobalSettings** — user configures which `VisibleField`s appear on the **front** (pre-flip) and which appear on the **back** (post-flip). Default: front = character only (driven by `characterType`), back = pinyin + meaning.
4. **Congratulations popup** — when the last card in a daily deck is marked learnt, show a retro-styled popup: "Day N complete! All X words learnt."
5. **Dashboard "days learnt" column** — in the "Your Sets" table, sets that have a `subsetSize` show a new column **Days learnt** showing `X/Y` (decks with all cards learnt / total decks). Non-split sets show `—`.

---

## Tech Stack Reference (DO NOT ADD NEW LIBRARIES)

| Tool | Version | Notes |
|---|---|---|
| React | 19.2.8 | `react-jsx` transform — never write `import React` |
| TypeScript | 6.0.2 | Strict: see rules below |
| Vite | 8.2.2 | |
| Firebase JS SDK | 12.18.0 | Firestore v9 modular API |
| @hello-pangea/dnd | 18.0.1 | Already installed |
| react-router-dom | 7.18.2 | |

**CSS approach:** Pure vanilla CSS only. All flip animations use **CSS custom properties + `transform-style: preserve-3d` + `perspective`** — no library needed. This is well-supported in all modern browsers (Chrome 36+, Firefox 16+, Safari 9+).

**No new npm packages.** Do NOT install framer-motion, react-spring, or any animation library.

### TypeScript strict rules
- `noUnusedLocals: true` — unused imports cause build errors.
- `noUnusedParameters: true` — prefix unused params with `_`.
- `erasableSyntaxOnly: true` — NO `enum`. Use `as const` arrays.
- `verbatimModuleSyntax: true` — **ALL type-only imports MUST use `import type`**.

### Firestore rules rules
- Rules file: `firestore.rules` in repo root.
- `isValidUserDoc()` uses `data.keys().hasOnly(...)` — every new field added to UserPreferences MUST be added to that whitelist.
- `isValidSetDoc()` uses `data.keys().hasOnly(...)` — every new field added to VocabSetDoc MUST be added to that whitelist.
- After modifying rules: `npx -y firebase-tools@latest deploy --only firestore:rules`

### Existing code patterns
- State mutations: `setItems(prev => ...)` functional updates.
- All async `useEffect` use an `active` flag: `let active = true; ... return () => { active = false; }`.
- `bump()` increments `version` to trigger autosave without `JSON.stringify`.
- Retro CSS theme: no border-radius, `font-family: var(--font-mono)` for headings/UI, `var(--font-body)` for content, `var(--font-hanzi)` for Chinese characters. Buttons: `retro-btn` class. Inputs: `retro-input` class. Fieldsets with `<legend>` for sections.

---

## Current File State (read before editing)

The codebase has already been updated through several rounds of changes. The CURRENT state of key files is:

### `frontend/src/types/index.ts` (current, 100 lines)
Contains: `VocabForm`, `VocabEntry`, `CharacterType`, `ALL_VISIBLE_FIELDS`, `VisibleField`, `DEFAULT_VISIBLE_FIELDS`, `PAGE_SIZES`, `PageSize`, `Occupation`, `OCCUPATIONS`, `UserPreferences` (with `pageSize: number`), `VocabStatus`, `VocabItem`, `VocabSetDoc` (with `lastAccessedAt`), `HydratedVocabItem`.

### `frontend/src/services/setService.ts` (current, 92 lines)
Contains: `SetWithId`, `createSet`, `getUserSets`, `getRecentSets`, `getSet`, `updateSet`, `deleteSet`, `touchSet`. `createSet` writes `lastAccessedAt: null`.

### `frontend/src/pages/SetDetail.tsx` (current, 468 lines)
Has: pagination (`page`, `pageSize`, `subsetsPerPage`, `totalPages`, `visibleSubsets`), `bump()` for autosave, `useAutosave(save, saveKey, 2000, loaded)`, drag-and-drop with `@hello-pangea/dnd`, `filter` state, `version` state, `subsetSize` state (capped at 100).

### `frontend/src/components/GlobalSettings.tsx` (current, 136 lines)
Has: character type toggle, visible fields checkboxes, cards-per-page (10/25/50/100) toggle buttons. `onSave` callback receives `{ characterType, visibleFields, pageSize }`.

### `frontend/src/pages/SetList.tsx` (current, 294 lines)
Has: `handleSaveSettings` accepting `{ characterType, visibleFields, pageSize }`, sets table with columns: `#, Name, Items, Learnt, Skipped, Created, Actions`.

### `frontend/src/components/VocabCard.tsx` (current, 132 lines)
Has: tri-state toggle (unlearned/learnt/skipped) with a `STATUS_INDEX` sliding thumb. Accepts `hydrated, characterType, visibleFields, onCycleStatus, onRemove` props. This component is the **list-view card** and MUST be kept as-is. You will create a NEW separate component for flashcard mode.

### `firestore.rules` (current, 124 lines)
`isValidUserDoc` whitelists: `displayName, characterType, visibleFields, pageSize, onboardingComplete, occupation, targetLevels, createdAt, updatedAt`.  
`isValidSetDoc` whitelists: `name, createdAt, updatedAt, shuffled, subsetSize, lastAccessedAt, items`.

---

## Feature 1: Last-Page Memory

### Purpose
When the user opens a split set, automatically navigate to the deck page they last left. Persist the current page to Firestore on every page change in flashcard mode.

### Data model change

**File: `frontend/src/types/index.ts`**

Add `lastDeckPage` to `VocabSetDoc`:
```typescript
export interface VocabSetDoc {
  name: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  shuffled: boolean;
  subsetSize: number | null;
  lastAccessedAt: Timestamp | null;
  lastDeckPage: number | null; // which deck page the user last studied (0-indexed); null if unset
  items: VocabItem[];
}
```

**File: `frontend/src/services/setService.ts`**

1. In `createSet`, add `lastDeckPage: null` to the written document.
2. Add a new exported function:
```typescript
/** Persists the last studied deck page index (0-indexed). Fire-and-forget. */
export async function saveLastPage(
  uid: string,
  setId: string,
  lastDeckPage: number
): Promise<void> {
  await updateDoc(setRef(uid, setId), { lastDeckPage });
}
```

**File: `firestore.rules`**

In `isValidSetDoc`, add `'lastDeckPage'` to `keys().hasOnly(...)` and add:
```
&& (data.lastDeckPage == null || (data.lastDeckPage is int && data.lastDeckPage >= 0))
```

Also update the data model comment:
```
//   - lastDeckPage: int | null (deck page index last studied; null if unset)
```

**File: `frontend/src/pages/SetDetail.tsx`**

1. Import `saveLastPage` from `setService`.
2. On load, read `s.lastDeckPage` and initialise `page` to `s.lastDeckPage ?? 0`:
   ```typescript
   setPage(s.lastDeckPage ?? 0);
   ```
   (Replace `setLoaded(true)` section — add `setPage(s.lastDeckPage ?? 0)` before `setLoaded(true)`.)
3. Add a `useEffect` that fires whenever `page` changes AND the set is in flashcard mode (i.e. `subsetSize != null`) AND the set is loaded:
   ```typescript
   useEffect(() => {
     if (!user || !setId || !loaded || !subsetSize) return;
     saveLastPage(user.uid, setId, page).catch(() => {
       /* non-critical */
     });
   }, [page, user, setId, loaded, subsetSize]);
   ```

---

## Feature 2: Flashcard Mode

### Architecture decision
When `subsetSize !== null` (set is split into daily decks), the pagination shows **exactly 1 deck per page** regardless of `pageSize`. The `pageSize` setting ONLY applies to the non-split list view. This simplifies the rendering dramatically: in flashcard mode `subsetsPerPage = 1` always.

**Important:** In the existing `subsetsPerPage` computation in `SetDetail.tsx`, already handled. The `subsetSize !== null` path already forces 1 deck per page when the exception triggers. You need to make it ALWAYS force 1 when in flashcard mode:

```typescript
const subsetsPerPage = useMemo(() => {
  if (!subsetSize || subsetSize <= 0) {
    return 1; // no decks — paginate individual cards by pageSize
  }
  // Flashcard mode: always exactly 1 deck per page
  return 1;
}, [subsetSize]);
```

(Remove the `pageSize < subsetSize` branch — in flashcard mode it's always 1.)

### Component: `FlashcardDeck` (NEW FILE)

**Create file:** `frontend/src/components/FlashcardDeck.tsx`

This component renders a single daily deck as a stacked flashcard experience.

#### Props interface:
```typescript
interface Props {
  deck: HydratedVocabItem[];          // The current deck cards in order
  deckIndex: number;                  // 1-based display index (Day N)
  characterType: CharacterType;
  frontFields: VisibleField[];        // Fields shown on card front (before flip)
  backFields: VisibleField[];         // Fields shown on card back (after flip)
  onStatusChange: (level: number, vocabId: number, status: VocabStatus) => void;
  onSkip: (level: number, vocabId: number) => void; // distinct from status change
  onDeckComplete: () => void;         // called when all cards in deck are "learnt"
}
```

#### Internal state:
```typescript
const [cardIndex, setCardIndex] = useState(0);   // which card is active (top of stack)
const [flipped, setFlipped] = useState(false);   // is the top card flipped?
const [localDeck, setLocalDeck] = useState<HydratedVocabItem[]>(deck); // working copy with cycling
```

Reset when `deck` prop changes (new page):
```typescript
useEffect(() => {
  setLocalDeck(deck);
  setCardIndex(0);
  setFlipped(false);
}, [deck]);
```

#### Algorithm for card cycling (unlearned loop)

The unlearned-loop algorithm works on `localDeck` (a working copy). It does NOT modify the parent `items` state — only status changes go up via `onStatusChange`.

```typescript
const advanceCard = (currentIdx: number, currentDeck: HydratedVocabItem[]) => {
  // Remove the current card from its position
  const next = [...currentDeck];
  const card = next.splice(currentIdx, 1)[0];

  if (card.item.status === "unlearned") {
    // Put unlearned cards at the bottom — they will be shown again
    next.push(card);
  }
  // Learnt and skipped cards are just removed from the working deck

  setFlipped(false);
  setLocalDeck(next);
  // cardIndex stays at 0 since we always remove the front card
  // (next card is now at index 0)

  // Check completion: all remaining cards are learnt
  const allLearnt = next.every((h) => h.item.status === "learnt");
  if (next.length === 0 || allLearnt) {
    onDeckComplete();
  }
};
```

When user sets status:
```typescript
const handleSetStatus = (status: VocabStatus) => {
  const card = localDeck[cardIndex];
  if (!card) return;
  // Update status in parent (triggers autosave)
  onStatusChange(card.item.level, card.item.vocabId, status);
  // Update status in our local working copy before advancing
  const updatedDeck = localDeck.map((h, i) =>
    i === cardIndex ? { ...h, item: { ...h.item, status } } : h
  );
  if (status === "skipped") {
    onSkip(card.item.level, card.item.vocabId);
  }
  advanceCard(cardIndex, updatedDeck);
};
```

#### Skip cascade — handled in the PARENT (SetDetail.tsx)

The `onSkip` callback triggers the cascade in SetDetail. **Do NOT implement cascade logic inside FlashcardDeck.**

#### CSS Flip Animation

**No library required.** Use pure CSS 3D transform:

```css
/* In style.css — under "SET DETAIL (STUDY VIEW)" section */

/* ---------- FLASHCARD DECK ---------- */
.flashcard-scene {
  perspective: 1000px;
  width: 100%;
  max-width: 560px;
  margin: 0 auto 20px;
}

.flashcard-stack {
  position: relative;
  height: 280px; /* Fixed height for the stack area */
}

/* Ghost cards behind — visual depth illusion */
.flashcard-ghost {
  position: absolute;
  inset: 0;
  border: 2px solid var(--border);
  background: #f0f0f0;
}

.flashcard-ghost:nth-child(1) {
  transform: translate(6px, 6px);
  z-index: 1;
}

.flashcard-ghost:nth-child(2) {
  transform: translate(3px, 3px);
  z-index: 2;
}

/* The active flippable card */
.flashcard-wrapper {
  position: absolute;
  inset: 0;
  z-index: 10;
  transform-style: preserve-3d;
  transition: transform 0.45s ease-in-out;
  cursor: pointer;
}

.flashcard-wrapper.is-flipped {
  transform: rotateY(180deg);
}

.flashcard-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border: 2px solid var(--border-dark);
  background: var(--bg-card);
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.flashcard-face.back {
  transform: rotateY(180deg);
  background: #fffff0; /* slight cream tint to distinguish back */
}

.flashcard-char {
  font-family: var(--font-hanzi);
  font-size: 72px;
  line-height: 1;
  text-align: center;
}

.flashcard-field {
  font-family: var(--font-body);
  font-size: 16px;
  text-align: center;
}

.flashcard-field-label {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
  margin-right: 4px;
}

.flashcard-hint {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 8px;
}

.flashcard-level-badge {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
  border: 1px solid var(--border);
  padding: 0 4px;
}

/* Status buttons — shown only after flip */
.flashcard-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 10px;
  flex-wrap: wrap;
}

.flashcard-status-btn {
  font-family: var(--font-mono);
  font-size: 14px;
  padding: 8px 18px;
  border: 2px outset var(--border);
  background: #ddd;
  cursor: pointer;
}

.flashcard-status-btn:active {
  border-style: inset;
}

.flashcard-status-btn.learnt {
  background: #ddffdd;
}

.flashcard-status-btn.skipped {
  background: #ffecd9;
}

.flashcard-status-btn.unlearned {
  background: #ddd;
}

/* Counter and progress */
.flashcard-meta {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-dim);
  text-align: center;
  margin-bottom: 10px;
}

/* Congrats popup overlay */
.congrats-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.congrats-box {
  background: var(--bg-card);
  border: 4px ridge var(--border-dark);
  padding: 32px 28px;
  max-width: 420px;
  width: 90%;
  text-align: center;
}

.congrats-box h2 {
  font-size: 28px;
  margin-bottom: 12px;
}

.congrats-box p {
  font-family: var(--font-mono);
  font-size: 16px;
  margin-bottom: 20px;
  color: var(--text-dim);
}

.congrats-stars {
  font-size: 36px;
  margin-bottom: 12px;
  display: block;
}
```

#### Full JSX structure for FlashcardDeck:

```tsx
export default function FlashcardDeck({
  deck,
  deckIndex,
  characterType,
  frontFields,
  backFields,
  onStatusChange,
  onSkip,
  onDeckComplete,
}: Props) {
  const [flipped, setFlipped] = useState(false);
  const [localDeck, setLocalDeck] = useState<HydratedVocabItem[]>([...deck]);
  const [showCongrats, setShowCongrats] = useState(false);

  useEffect(() => {
    setLocalDeck([...deck]);
    setFlipped(false);
    setShowCongrats(false);
  }, [deck]);

  const current = localDeck[0];
  const remaining = localDeck.length;

  const handleFlip = () => {
    if (!current) return;
    setFlipped(true); // only flip forward; reset happens on card advance
  };

  const advanceCard = (updatedDeck: HydratedVocabItem[]) => {
    // Remove the front card
    const next = updatedDeck.slice(1);
    const movedCard = updatedDeck[0];

    if (movedCard.item.status === "unlearned") {
      // Cycle to bottom
      next.push(movedCard);
    }
    // Learnt/skipped: removed permanently from working deck

    setFlipped(false);
    setLocalDeck(next);

    const allDone = next.length === 0 || next.every((h) => h.item.status === "learnt");
    if (allDone) {
      setShowCongrats(true);
      onDeckComplete();
    }
  };

  const handleSetStatus = (status: VocabStatus) => {
    if (!current) return;
    // Propagate to parent for persistence
    onStatusChange(current.item.level, current.item.vocabId, status);
    if (status === "skipped") {
      onSkip(current.item.level, current.item.vocabId);
    }
    // Update status in local copy before advancing
    const updated: HydratedVocabItem[] = localDeck.map((h, i) =>
      i === 0 ? { ...h, item: { ...h.item, status } } : h
    );
    advanceCard(updated);
  };

  if (!current && !showCongrats) {
    return <p className="placeholder">No cards in this deck.</p>;
  }

  return (
    <>
      <p className="flashcard-meta">
        Day {deckIndex} &mdash; {remaining} card{remaining === 1 ? "" : "s"} remaining
      </p>
      <div className="flashcard-scene">
        <div className="flashcard-stack">
          {/* Ghost depth cards */}
          <div className="flashcard-ghost" aria-hidden="true" />
          <div className="flashcard-ghost" aria-hidden="true" />
          {/* Active card */}
          {current && (
            <div
              className={`flashcard-wrapper${flipped ? " is-flipped" : ""}`}
              onClick={!flipped ? handleFlip : undefined}
              role="button"
              aria-label={flipped ? "Card flipped" : "Click to reveal"}
              tabIndex={0}
              onKeyDown={(e) => {
                if (!flipped && (e.key === "Enter" || e.key === " ")) handleFlip();
              }}
            >
              {/* Front face */}
              <div className="flashcard-face front">
                <span className="flashcard-level-badge">HSK {current.item.level}</span>
                <span className="flashcard-char">
                  {characterFor(current.entry, characterType)}
                </span>
                {frontFields.map((field) => {
                  const val = displayFor(current.entry, field);
                  if (!val) return null;
                  return (
                    <span key={field} className="flashcard-field">
                      <span className="flashcard-field-label">{FIELD_LABELS[field]}:</span>
                      {val}
                    </span>
                  );
                })}
                {!flipped && (
                  <span className="flashcard-hint">[ click to reveal ]</span>
                )}
              </div>
              {/* Back face */}
              <div className="flashcard-face back">
                <span className="flashcard-level-badge">HSK {current.item.level}</span>
                <span className="flashcard-char">
                  {characterFor(current.entry, characterType)}
                </span>
                {backFields.map((field) => {
                  const val = displayFor(current.entry, field);
                  if (!val) return null;
                  return (
                    <span key={field} className="flashcard-field">
                      <span className="flashcard-field-label">{FIELD_LABELS[field]}:</span>
                      {val}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status buttons — only shown after flip */}
      {flipped && current && (
        <div className="flashcard-actions">
          <button
            className="flashcard-status-btn learnt"
            onClick={() => handleSetStatus("learnt")}
          >
            [ Learnt ✓ ]
          </button>
          <button
            className="flashcard-status-btn skipped"
            onClick={() => handleSetStatus("skipped")}
          >
            [ Skip → ]
          </button>
          <button
            className="flashcard-status-btn unlearned"
            onClick={() => handleSetStatus("unlearned")}
          >
            [ Again ↺ ]
          </button>
        </div>
      )}

      {/* Congrats popup */}
      {showCongrats && (
        <div className="congrats-overlay" role="dialog" aria-modal="true">
          <div className="congrats-box">
            <span className="congrats-stars">★★★</span>
            <h2>=== Day {deckIndex} Complete! ===</h2>
            <p>
              You learnt all {deck.length} word{deck.length === 1 ? "" : "s"} for
              today. 加油！
            </p>
            <button
              className="retro-btn primary"
              onClick={() => setShowCongrats(false)}
            >
              [ Continue ]
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

**Imports for FlashcardDeck.tsx:**
```typescript
import { useEffect, useState } from "react";
import { characterFor, displayFor } from "../utils/vocab";
import type {
  CharacterType,
  HydratedVocabItem,
  VisibleField,
  VocabStatus,
} from "../types";

const FIELD_LABELS: Record<VisibleField, string> = {
  pinyin: "Pinyin",
  toneNumber: "Tone number",
  wadeGiles: "Wade-Giles",
  bopomofo: "Bopomofo",
  gwoyeu: "Gwoyeu",
  meaning: "Meaning",
  partsOfSpeech: "Parts of speech",
  radical: "Radical",
  frequency: "Frequency",
  classifiers: "Classifiers",
};
```

---

## Feature 3: Front/Back Field Configuration in GlobalSettings

### New fields in `UserPreferences`

**File: `frontend/src/types/index.ts`**

Add to `UserPreferences`:
```typescript
export interface UserPreferences {
  displayName: string;
  characterType: CharacterType;
  visibleFields: VisibleField[];      // used in LIST view (existing)
  flashcardFrontFields: VisibleField[]; // NEW: shown before flip (default: [] = character only)
  flashcardBackFields: VisibleField[];  // NEW: shown after flip (default: ["pinyin", "meaning"])
  pageSize: number;
  onboardingComplete: boolean;
  occupation: Occupation | null;
  targetLevels: number[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Add constants after `DEFAULT_VISIBLE_FIELDS`:
```typescript
export const DEFAULT_FLASHCARD_FRONT_FIELDS: VisibleField[] = [];       // character only (no extra fields on front)
export const DEFAULT_FLASHCARD_BACK_FIELDS: VisibleField[] = ["pinyin", "meaning"];
```

### `userService.ts` — add defaults + migration

**File: `frontend/src/services/userService.ts`**

1. Import the new constants:
```typescript
import {
  DEFAULT_VISIBLE_FIELDS,
  DEFAULT_FLASHCARD_FRONT_FIELDS,
  DEFAULT_FLASHCARD_BACK_FIELDS,
  type CharacterType,
  type Occupation,
  type PageSize,
  type UserPreferences,
  type VisibleField,
} from "../types";
```

2. Add to `UserPrefUpdate`:
```typescript
export interface UserPrefUpdate {
  characterType?: CharacterType;
  visibleFields?: VisibleField[];
  flashcardFrontFields?: VisibleField[];
  flashcardBackFields?: VisibleField[];
  pageSize?: PageSize;
  onboardingComplete?: boolean;
  occupation?: Occupation | null;
  targetLevels?: number[];
}
```

3. Extend migration check (line 44 currently):
```typescript
if (
  data.onboardingComplete == null ||
  data.occupation === undefined ||
  data.targetLevels === undefined ||
  data.pageSize === undefined ||
  data.flashcardFrontFields === undefined ||
  data.flashcardBackFields === undefined
) {
  const migrated: UserPreferences = {
    ...data,
    pageSize: data.pageSize ?? 50,
    flashcardFrontFields: data.flashcardFrontFields ?? DEFAULT_FLASHCARD_FRONT_FIELDS,
    flashcardBackFields: data.flashcardBackFields ?? DEFAULT_FLASHCARD_BACK_FIELDS,
    onboardingComplete: data.onboardingComplete ?? false,
    occupation: data.occupation ?? null,
    targetLevels: data.targetLevels ?? [],
  };
  await setDoc(ref, migrated, { merge: true });
  return migrated;
}
```

4. Add to `defaults`:
```typescript
const defaults: UserPreferences = {
  displayName: user.displayName ?? user.email ?? "User",
  characterType: "simplified",
  visibleFields: DEFAULT_VISIBLE_FIELDS,
  flashcardFrontFields: DEFAULT_FLASHCARD_FRONT_FIELDS,
  flashcardBackFields: DEFAULT_FLASHCARD_BACK_FIELDS,
  pageSize: 50,
  onboardingComplete: false,
  occupation: null,
  targetLevels: [],
  createdAt: now(),
  updatedAt: now(),
};
```

### `firestore.rules` — extend whitelist

In `isValidUserDoc`, add `'flashcardFrontFields'` and `'flashcardBackFields'` to `keys().hasOnly(...)`:
```
['displayName', 'characterType', 'visibleFields', 'flashcardFrontFields', 'flashcardBackFields',
 'pageSize', 'onboardingComplete', 'occupation', 'targetLevels', 'createdAt', 'updatedAt']
```

Add validation after `visibleFields`:
```
&& data.flashcardFrontFields is list
&& data.flashcardFrontFields.size() <= 10
&& data.flashcardBackFields is list
&& data.flashcardBackFields.size() <= 10
```

Update comments at top of file:
```
//   - flashcardFrontFields: list of VisibleField string (required, <= 10, default [])
//   - flashcardBackFields: list of VisibleField string (required, <= 10, default ["pinyin","meaning"])
```

### `GlobalSettings.tsx` — add front/back field pickers

**File: `frontend/src/components/GlobalSettings.tsx`**

1. Update imports to include new constants and fields:
```typescript
import {
  ALL_VISIBLE_FIELDS,
  PAGE_SIZES,
  DEFAULT_FLASHCARD_FRONT_FIELDS,
  DEFAULT_FLASHCARD_BACK_FIELDS,
  type CharacterType,
  type PageSize,
  type UserPreferences,
  type VisibleField,
} from "../types";
```

2. Update `Props.onSave` signature:
```typescript
interface Props {
  prefs: UserPreferences;
  onSave: (prefs: {
    characterType: CharacterType;
    visibleFields: VisibleField[];
    flashcardFrontFields: VisibleField[];
    flashcardBackFields: VisibleField[];
    pageSize: PageSize;
  }) => Promise<void> | void;
}
```

3. Add state for the new fields inside the component:
```typescript
const [flashcardFrontFields, setFlashcardFrontFields] = useState<VisibleField[]>(
  prefs.flashcardFrontFields ?? DEFAULT_FLASHCARD_FRONT_FIELDS
);
const [flashcardBackFields, setFlashcardBackFields] = useState<VisibleField[]>(
  prefs.flashcardBackFields ?? DEFAULT_FLASHCARD_BACK_FIELDS
);
```

4. Update `handleSave`:
```typescript
await onSave({ characterType, visibleFields, flashcardFrontFields, flashcardBackFields, pageSize });
```

5. Add two new setting groups in the JSX, AFTER the "Cards per page" section and BEFORE the Save button:

```tsx
<div className="setting-group">
  <label className="setting-label">Flashcard front (before flip)</label>
  <p className="setting-note">Character always shown. Add extra fields below:</p>
  <div className="check-list">
    {ALL_VISIBLE_FIELDS.map((field) => (
      <label key={field} className="check-item">
        <input
          type="checkbox"
          checked={flashcardFrontFields.includes(field)}
          onChange={() => {
            setSaved(false);
            setFlashcardFrontFields((prev) =>
              prev.includes(field)
                ? prev.filter((f) => f !== field)
                : [...prev, field]
            );
          }}
        />
        <span>{FIELD_LABELS[field]}</span>
      </label>
    ))}
  </div>
</div>

<div className="setting-group">
  <label className="setting-label">Flashcard back (after flip)</label>
  <div className="check-list">
    {ALL_VISIBLE_FIELDS.map((field) => (
      <label key={field} className="check-item">
        <input
          type="checkbox"
          checked={flashcardBackFields.includes(field)}
          onChange={() => {
            setSaved(false);
            setFlashcardBackFields((prev) =>
              prev.includes(field)
                ? prev.filter((f) => f !== field)
                : [...prev, field]
            );
          }}
        />
        <span>{FIELD_LABELS[field]}</span>
      </label>
    ))}
  </div>
</div>
```

Add a small CSS rule to `style.css` for the note:
```css
.setting-note {
  font-size: 12px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  margin-bottom: 6px;
}
```

### `SetList.tsx` — pass new fields through `handleSaveSettings`

**File: `frontend/src/pages/SetList.tsx`**

Update `handleSaveSettings`:
```typescript
const handleSaveSettings = async (p: {
  characterType: CharacterType;
  visibleFields: VisibleField[];
  flashcardFrontFields: VisibleField[];
  flashcardBackFields: VisibleField[];
  pageSize: PageSize;
}) => {
  if (!user) return;
  await updateUserPreferences(user.uid, p);
  setPrefs((prev) => (prev ? { ...prev, ...p } : prev));
};
```

---

## Feature 4: Skip Cascade Algorithm in SetDetail

### How the cascade works

The `items` array is ordered: `[deck0_card0, deck0_card1, ..., deck0_cardN, deck1_card0, ..., deckM_cardK]`.

When a card at position `P` in the FULL `items` array is skipped:
1. The card at `P` gets status `"skipped"` (already handled by `cycleStatus`).
2. Deck `D = floor(P / subsetSize)` now has `subsetSize - 1` cards.
3. To rebalance: take `items[D * subsetSize + subsetSize]` (the first card of deck D+1) and **splice** it into position `D * subsetSize + subsetSize - 1` (just after the current deck's last non-skipped slot). Wait — simpler: just swap the skipped card to the END of the current deck (since it leaves the deck), and pull the first card of the next deck to fill the gap.

**Optimized algorithm — O(n) single pass:**

The most efficient way: rebuild a new `items` array by taking every `subsetSize` chunk and ensuring each chunk has exactly `subsetSize` items by pulling from the next chunk when a "skip" gap is found.

Implement this as a function in `SetDetail.tsx`:

```typescript
/**
 * After a skip, rebalances the decks so each deck maintains subsetSize cards.
 * When a card is skipped, the first card of the NEXT deck is pulled to fill
 * the gap. This cascades through all subsequent decks.
 *
 * Algorithm (O(n)):
 * 1. Collect all non-skipped cards in their original order into a flat buffer.
 * 2. Re-split the buffer into chunks of subsetSize.
 * 3. Skipped cards are appended to the very end (last deck shrinks).
 *
 * This preserves the original order of non-skipped cards and correctly
 * shifts cards from next deck to fill gaps, cascading automatically.
 */
function rebalanceDecksAfterSkip(
  items: VocabItem[],
  subsetSize: number
): VocabItem[] {
  // Separate skipped from non-skipped, preserving order
  const active: VocabItem[] = [];
  const skipped: VocabItem[] = [];
  for (const item of items) {
    if (item.status === "skipped") {
      skipped.push(item);
    } else {
      active.push(item);
    }
  }
  // Reassemble: non-skipped cards fill decks evenly, skipped go to the end
  return [...active, ...skipped];
}
```

**Why this algorithm is correct and O(n):**
- All non-skipped cards keep their relative order. This means deck 1 still gets cards 0..K-1, deck 2 gets cards K..2K-1, etc. — where K = subsetSize.
- When a card is skipped, it leaves the `active` array. The next deck's first card naturally moves up to fill the gap in the previous deck on the next re-split.
- Skipped cards pile up at the end of the full array (last deck). The last deck will be shorter. This is correct behaviour.
- Time complexity: one pass to split (O(n)), one pass to merge (O(n)).

**Integrate cascade into SetDetail.tsx:**

Add a new mutation `handleSkip`:

```typescript
const handleSkip = (level: number, vocabId: number) => {
  if (!subsetSize) return; // no decks, no cascade needed
  setItems((prev) => {
    // First mark the card as skipped (if not already)
    const withSkip = prev.map((i) =>
      i.level === level && i.vocabId === vocabId
        ? { ...i, status: "skipped" as VocabStatus }
        : i
    );
    return rebalanceDecksAfterSkip(withSkip, subsetSize);
  });
  bump();
};
```

Pass `handleSkip` to `FlashcardDeck` as the `onSkip` prop.

**Note:** `cycleStatus` is still called first by FlashcardDeck to set the status to "skipped". But `handleSkip` re-applies the status mapping and does the rebalance in one atomic `setItems` call. To avoid double-calling, have FlashcardDeck call ONLY `onSkip` for skips (not `onStatusChange`). Update `FlashcardDeck` props:
- If `status === "skipped"`, call `onSkip(level, vocabId)` only (not `onStatusChange`).
- For `"learnt"` and `"unlearned"`, call `onStatusChange(level, vocabId, status)`.

Update `handleSetStatus` in `FlashcardDeck`:
```typescript
const handleSetStatus = (status: VocabStatus) => {
  if (!current) return;
  if (status === "skipped") {
    onSkip(current.item.level, current.item.vocabId);
  } else {
    onStatusChange(current.item.level, current.item.vocabId, status);
  }
  const updated = localDeck.map((h, i) =>
    i === 0 ? { ...h, item: { ...h.item, status } } : h
  );
  advanceCard(updated);
};
```

---

## Feature 5: Integrate FlashcardDeck into SetDetail

### Render logic change

**File: `frontend/src/pages/SetDetail.tsx`**

When `subsetSize !== null`, replace the drag-and-drop fieldset rendering with `FlashcardDeck`.

The current render block (around line 363-433) conditionally renders `DragDropContext` with `visibleSubsets`. Change it:

```tsx
{!vocabLoading && filteredHydrated.length > 0 && (
  <>
    {subsetSize && subsetSize > 0 ? (
      /* FLASHCARD MODE */
      <>
        {visibleSubsets[0] && (
          <FlashcardDeck
            key={page} // reset component state when page changes
            deck={visibleSubsets[0]}
            deckIndex={page + 1}
            characterType={prefs?.characterType ?? "simplified"}
            frontFields={prefs?.flashcardFrontFields ?? DEFAULT_FLASHCARD_FRONT_FIELDS}
            backFields={prefs?.flashcardBackFields ?? DEFAULT_FLASHCARD_BACK_FIELDS}
            onStatusChange={cycleStatus}
            onSkip={handleSkip}
            onDeckComplete={() => {
              /* optional: could auto-advance to next day here */
            }}
          />
        )}
      </>
    ) : (
      /* LIST MODE (existing drag-and-drop) */
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="daily-decks">
          {visibleSubsets.map((subset, idx) => (
            <fieldset key={idx} className="daily-deck">
              ...existing fieldset JSX unchanged...
            </fieldset>
          ))}
        </div>
      </DragDropContext>
    )}

    {/* Pagination — shown in both modes */}
    {totalPages > 1 && (
      <div className="pagination-controls">
        ...existing pagination JSX unchanged...
      </div>
    )}
  </>
)}
```

**Add imports to SetDetail.tsx:**
```typescript
import FlashcardDeck from "../components/FlashcardDeck";
import { DEFAULT_FLASHCARD_FRONT_FIELDS, DEFAULT_FLASHCARD_BACK_FIELDS } from "../types";
import { saveLastPage } from "../services/setService";
```

---

## Feature 6: Dashboard "Days Learnt" Column

### Calculation

For a set with `subsetSize !== null`:
- Total decks = `Math.ceil(items.length / subsetSize)`
- Deck `D` is "complete" if ALL cards in `items.slice(D * subsetSize, (D+1) * subsetSize)` have `status === "learnt"`.

**Optimized: O(n) single pass:**

```typescript
function daysLearntInfo(set: SetWithId): { done: number; total: number } | null {
  if (!set.subsetSize || set.subsetSize <= 0) return null;
  const size = set.subsetSize;
  const items = set.items ?? [];
  const total = Math.ceil(items.length / size);
  let done = 0;
  for (let d = 0; d < total; d++) {
    const start = d * size;
    const end = Math.min(start + size, items.length);
    let deckDone = true;
    for (let i = start; i < end; i++) {
      if (items[i].status !== "learnt") { deckDone = false; break; }
    }
    if (deckDone) done++;
  }
  return { done, total };
}
```

Add this function to **`SetList.tsx`** (alongside the existing `statusCounts` function).

### Update the "Your Sets" table

**File: `frontend/src/pages/SetList.tsx`**

1. Add a new `<th>Days learnt</th>` column header after `<th>Created</th>` and before `<th>Actions</th>`.

2. In each `<tr>` for a set, add the cell:
```tsx
<td>
  {(() => {
    const info = daysLearntInfo(set);
    if (!info) return "—";
    return `${info.done}/${info.total}`;
  })()}
</td>
```

---

## Summary of All File Changes

| File | Change |
|---|---|
| `frontend/src/types/index.ts` | Add `flashcardFrontFields`, `flashcardBackFields` to `UserPreferences`; add `DEFAULT_FLASHCARD_FRONT_FIELDS`, `DEFAULT_FLASHCARD_BACK_FIELDS`; add `lastDeckPage` to `VocabSetDoc` |
| `frontend/src/services/setService.ts` | Add `lastDeckPage: null` to `createSet`; add `saveLastPage()` function |
| `frontend/src/services/userService.ts` | Add new fields to migration, defaults, and `UserPrefUpdate` |
| `firestore.rules` | Extend `isValidUserDoc` whitelist and validation; extend `isValidSetDoc` |
| `frontend/src/components/GlobalSettings.tsx` | Add front/back flashcard field pickers; update `onSave` signature |
| `frontend/src/pages/SetList.tsx` | Update `handleSaveSettings` signature; add `daysLearntInfo` function; add "Days learnt" column |
| `frontend/src/pages/SetDetail.tsx` | Import `FlashcardDeck`, `saveLastPage`, defaults; update `setPage` init from `lastDeckPage`; add `handleSkip` + `rebalanceDecksAfterSkip`; update `subsetsPerPage` to always be 1 in split mode; add `saveLastPage` effect; switch render to `FlashcardDeck` in split mode |
| `frontend/src/components/FlashcardDeck.tsx` | **NEW FILE** — full flashcard component with flip animation, unlearned cycling, status buttons, congrats popup |
| `frontend/src/style.css` | Add `.flashcard-*` CSS block, `.congrats-*` CSS block, `.setting-note` |

---

## Verification Checklist

Run these in order after completing all changes:

1. **TypeScript build — must pass with zero errors:**
   ```
   cd frontend && npm run build
   ```

2. **Firestore rules deploy:**
   ```
   npx -y firebase-tools@latest deploy --only firestore:rules
   ```

3. **Dev server smoke test:**
   ```
   cd frontend && npm run dev
   ```

4. **Manual checks:**
   - Create a set, split into decks. Open it. Flashcard mode activates.
   - Click card → it flips with 3D animation.
   - Mark a card "Learnt" → next card advances automatically.
   - Mark a card "Again" → card cycles to bottom, shown again later.
   - Mark a card "Skip" → cascade rebalances decks (check by navigating next page).
   - Complete all cards in a deck → congrats popup appears.
   - Navigate to next page → Day 2 deck appears.
   - Close set and reopen → same page (Day N) is loaded.
   - Dashboard "Your Sets" → "Days learnt" column shows `X/Y` for split sets, `—` for others.
   - Settings → flashcard front/back pickers work, save and reload reflect correctly.

5. **Commit:**
   ```
   git add -A
   git commit -m "Flashcard mode: flip animation, skip cascade, last-page memory, front/back fields, days learnt dashboard"
   ```

---

## CRITICAL RULES

1. **No new npm packages.** All animation is pure CSS.
2. **Do NOT rewrite existing components from scratch.** Modify only what is specified. `VocabCard.tsx` is unchanged.
3. **Use `import type` for all type-only imports** (TypeScript will fail the build otherwise).
4. **No `enum` keyword** — use `as const` arrays.
5. **`active` flag pattern** in all async `useEffect` hooks.
6. **Retro theme**: no border-radius, no shadows, use `var(--font-mono)` / `var(--font-body)` / `var(--font-hanzi)`, `retro-btn` class for buttons.
7. **Build must pass before committing.** Fix all TS errors before the commit step.
8. **Deploy rules after modifying them.** Never skip the `firebase-tools deploy` step.
