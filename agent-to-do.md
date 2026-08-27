# HSK Learning Web App — Agent Implementation Plan

> **Purpose**: Step-by-step iterative guide for a lower-context-window AI agent to build the full HSK vocabulary learning app. Each phase is self-contained — read only the phase you're working on, plus the **Reference** section at the bottom for data shapes and file paths.

---

## Project Overview

An HSK (Chinese proficiency) vocabulary learning website where authenticated users can:
- Create custom vocabulary **sets** from HSK levels 1–7
- Configure global display preferences (simplified/traditional, which fields to show)
- Study sets with per-set controls: shuffle, divide into subsets, add/remove vocab
- Tag vocabulary as **unlearned** (default), **learnt**, or **skipped**
- Auto-save state to Firestore so progress persists across sessions

### Architecture Principle: **Minimal Backend Work**
- Vocab JSON files (levels 1–7) are **static assets served by Vite** — never stored in Firestore
- Firestore stores ONLY: user preferences, set metadata, and per-vocab learning status
- All filtering, shuffling, subset division happens **client-side in React**
- Firestore writes are debounced/batched for autosave efficiency

---

## Current State of the Codebase

```
hsk_learning_website/
├── frontend/                     # React 19 + TypeScript + Vite 8
│   ├── src/
│   │   ├── App.tsx               # Root — renders <Login />
│   │   ├── main.tsx              # Entry point
│   │   ├── style.css             # Global CSS (light/dark tokens)
│   │   ├── counter.ts            # UNUSED — Vite scaffold leftover, DELETE
│   │   ├── components/
│   │   │   └── Login.tsx         # Email + Google sign-in
│   │   └── firebase/
│   │       └── firebaseConfig.ts # Firebase init + auth helpers (uses .env)
│   ├── .env                      # Firebase keys (git-ignored)
│   ├── .env.example              # Template (committed)
│   └── package.json              # react, react-dom, firebase v12
├── hsk_vocab_list/               # Static HSK vocab data
│   ├── 1.min.json  (294 entries)
│   ├── 2.min.json  (197 entries)
│   ├── 3.min.json  (487 entries)
│   ├── 4.min.json  (972 entries)
│   ├── 5.min.json  (1547 entries)
│   ├── 6.min.json  (1684 entries)
│   └── 7.min.json  (4876 entries)
├── firebase.json                 # Firestore feature configured
├── firestore.rules               # DEFAULT temp rules (expire 2026-09-26) — MUST REPLACE
├── firestore.indexes.json
└── .firebaserc                   # Project: hsk-learning-webapp
```

### Firebase Project
- **Project ID**: `hsk-learning-webapp`
- **Auth providers**: Email/Password + Google Sign-In (enabled in Console)
- **Firestore**: API enabled, **no database instance created yet** — needs provisioning
- **SDK**: Firebase v12 modular (tree-shakable)

---

## Reference: Vocab JSON Schema

Each `{level}.min.json` is an array of vocab entry objects:

```jsonc
{
  "id": 1,              // unique numeric ID within this level
  "s": "爱",            // simplified Chinese character(s)
  "r": "爫",            // radical
  "q": 130,             // frequency rank
  "p": ["v", "vn", "b"], // parts of speech
  "f": [                 // forms array (can have multiple — e.g. 吧 has 3)
    {
      "t": "愛",         // traditional Chinese character(s)
      "i": {             // input/romanization variants
        "y": "ài",       // pinyin (DEFAULT display)
        "n": "ai4",      // pinyin with tone number
        "w": "ai⁴",      // Wade-Giles
        "b": "ㄞˋ",      // bopomofo / zhuyin
        "g": "ay"        // Gwoyeu Romatzyh
      },
      "m": [             // meanings array (DEFAULT display)
        "to love; to be fond of; to like",
        "affection"
      ],
      "c": []            // classifiers (measure words)
    }
  ]
}
```

### Key Mapping for User Settings
| Display Setting | Default | JSON Field Path |
|---|---|---|
| Character type | Simplified | `entry.s` (simplified) vs `entry.f[n].t` (traditional) |
| Romanization | Pinyin | `entry.f[n].i.y` (pinyin) |
| Meaning | Show | `entry.f[n].m` |
| Parts of speech | Hide | `entry.p` |
| Radical | Hide | `entry.r` |
| Frequency | Hide | `entry.q` |
| Classifiers | Hide | `entry.f[n].c` |

---

## Reference: Firestore Data Model

### Collection: `users/{uid}`
One document per user. Stores global preferences only.

```typescript
interface UserDoc {
  displayName: string;        // from Firebase Auth
  characterType: "simplified" | "traditional";  // default: "simplified"
  visibleFields: string[];    // default: ["pinyin", "meaning"]
  // Valid values: "pinyin", "toneNumber", "wadeGiles", "bopomofo",
  //              "gwoyeu", "meaning", "partsOfSpeech", "radical",
  //              "frequency", "classifiers"
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Collection: `users/{uid}/sets/{setId}`
Each set document stores metadata and the full ordered list of vocab references + learning state.

```typescript
interface VocabSetDoc {
  name: string;                    // user-given name, e.g. "HSK 1+2 mix"
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Per-set settings (override global for this set)
  shuffled: boolean;               // default: false
  subsetSize: number | null;       // null = no subdivision
  // Vocab items — stored as an array of lightweight references
  // This is the core trick: we store ONLY level+id+status, NOT the full vocab text.
  // The client joins this with the static JSON at render time.
  items: VocabItem[];
}

interface VocabItem {
  level: number;     // 1–7, maps to {level}.min.json
  vocabId: number;   // matches entry.id in the JSON
  status: "unlearned" | "learnt" | "skipped";  // default: "unlearned"
}
```

### Why this model is minimal-backend:
- **No vocab text in Firestore** — just `level` + `vocabId` references (~12 bytes per item vs ~200+ bytes for full entry)
- **No subcollections per vocab item** — a set of 500 items is ONE document (~6KB), well within Firestore's 1MB limit
- **Shuffling & subsets are client-side** — the `items` array order IS the shuffle order; subsets are computed by slicing
- **Autosave = debounced writes** to this single doc

### Firestore Size Estimate
- Largest possible set: all 7 levels = 10,057 items × ~12 bytes = ~120KB (safe under 1MB)
- Typical set: 200–500 items = 2.4–6KB

---

## Reference: Key File Paths

| Purpose | Path |
|---|---|
| React entry | `frontend/src/main.tsx` |
| Root component | `frontend/src/App.tsx` |
| Global CSS | `frontend/src/style.css` |
| Firebase config | `frontend/src/firebase/firebaseConfig.ts` |
| Login component | `frontend/src/components/Login.tsx` |
| Vocab JSON dir | `hsk_vocab_list/` |
| Firestore rules | `firestore.rules` |
| Firebase config | `firebase.json` |
| Package deps | `frontend/package.json` |
| TS config | `frontend/tsconfig.json` |

---

## Phase 0: Cleanup & Infrastructure

> **Goal**: Clean up leftover files and provision the Firestore database.

### Tasks

- [ ] **0.1** Delete `frontend/src/counter.ts` (unused Vite scaffold leftover)
- [ ] **0.2** Provision Firestore database via CLI:
  ```bash
  firebase firestore:databases:create "(default)" --edition="enterprise" --location="asia-southeast1" --project hsk-learning-webapp
  ```
  > Use `asia-southeast1` (Singapore) for low latency. Adjust if user is elsewhere.
- [ ] **0.3** Copy vocab JSON files into `frontend/public/data/` so Vite serves them as static assets:
  ```bash
  mkdir -p frontend/public/data
  cp hsk_vocab_list/*.min.json frontend/public/data/
  ```
- [ ] **0.4** Add Firestore to `firebaseConfig.ts`:
  ```typescript
  import { getFirestore } from "firebase/firestore";
  export const db = getFirestore(app);
  ```
- [ ] **0.5** Add `react-router-dom` for navigation:
  ```bash
  cd frontend && npm install react-router-dom
  ```
- [ ] **0.6** Verify the dev server starts without errors: `npm run dev`

---

## Phase 1: Auth State Management & Routing

> **Goal**: Add auth state listener, protected routes, and a post-login dashboard shell.

### Context
- Currently `App.tsx` only renders `<Login />` with no routing
- Need: auth context → conditional rendering → dashboard page

### Tasks

- [ ] **1.1** Create `frontend/src/contexts/AuthContext.tsx`
  - Use `onAuthStateChanged` from `firebase/auth` to track user state
  - Export a `useAuth()` hook that returns `{ user, loading, signOut }`
  - Wrap the app in `<AuthProvider>`
- [ ] **1.2** Create `frontend/src/components/ProtectedRoute.tsx`
  - If `loading` → show spinner
  - If no `user` → redirect to `/login`
  - Otherwise → render children
- [ ] **1.3** Update `frontend/src/App.tsx` with React Router:
  - `/login` → `<Login />` (redirect to `/dashboard` if already signed in)
  - `/dashboard` → `<Dashboard />` (protected)
  - `/` → redirect to `/dashboard`
- [ ] **1.4** Create placeholder `frontend/src/pages/Dashboard.tsx`
  - Show user's display name + sign out button
  - Placeholder text: "Your vocabulary sets will appear here"
- [ ] **1.5** Add sign-out functionality to `Login.tsx` / dashboard
- [ ] **1.6** Update `main.tsx` to wrap with `<BrowserRouter>` and `<AuthProvider>`
- [ ] **1.7** Test: sign in with Google → lands on dashboard → refresh stays signed in → sign out returns to login

---

## Phase 2: User Preferences (Global Settings)

> **Goal**: When a user first signs in, create their Firestore user doc with defaults. Allow editing global preferences.

### Context
- Firestore path: `users/{uid}`
- Default: `characterType: "simplified"`, `visibleFields: ["pinyin", "meaning"]`

### Tasks

- [ ] **2.1** Create `frontend/src/types/index.ts` with TypeScript interfaces:
  - `UserPreferences`, `VocabSet`, `VocabItem`, `VocabEntry` (raw JSON shape)
- [ ] **2.2** Create `frontend/src/services/userService.ts`
  - `getOrCreateUserDoc(user: User): Promise<UserPreferences>` — checks if doc exists, creates with defaults if not
  - `updateUserPreferences(uid, prefs): Promise<void>` — mergeUpdate
  - Use `doc`, `getDoc`, `setDoc`, `updateDoc` from `firebase/firestore`
- [ ] **2.3** Create `frontend/src/components/GlobalSettings.tsx`
  - Toggle: Simplified ↔ Traditional
  - Checkboxes: which fields to show (pinyin, toneNumber, wadeGiles, bopomofo, gwoyeu, meaning, partsOfSpeech, radical, frequency, classifiers)
  - Save button → calls `updateUserPreferences`
- [ ] **2.4** Load user preferences on dashboard mount, pass to settings component
- [ ] **2.5** Test: create new user → doc appears in Firestore Console → change settings → verify doc updates

---

## Phase 3: Vocab Data Loader

> **Goal**: Build a service that fetches and caches the static vocab JSON files client-side.

### Context
- Vocab JSON is in `frontend/public/data/{level}.min.json`
- Fetched via `fetch('/data/1.min.json')` at runtime
- Cache in memory (Map) so we don't re-fetch on every navigation

### Tasks

- [ ] **3.1** Create `frontend/src/services/vocabLoader.ts`
  - `loadLevel(level: number): Promise<VocabEntry[]>` — fetch + cache
  - `loadLevels(levels: number[]): Promise<Map<number, VocabEntry[]>>` — batch load
  - `getVocabById(level: number, id: number): VocabEntry | undefined` — lookup from cache
  - Internal: `const cache: Map<number, VocabEntry[]> = new Map()`
- [ ] **3.2** Create `frontend/src/hooks/useVocabData.ts`
  - React hook that wraps `loadLevels` with loading/error state
  - Returns `{ data, loading, error }`
- [ ] **3.3** Test: render vocab entries on dashboard temporarily to verify data loading works

---

## Phase 4: Set Creation & Management

> **Goal**: Users can create, view, rename, and delete vocabulary sets.

### Context
- Firestore path: `users/{uid}/sets/{setId}`
- Sets are subcollections of the user doc
- Set creation requires choosing levels and vocab items

### Tasks

- [ ] **4.1** Create `frontend/src/services/setService.ts`
  - `createSet(uid, name, items: VocabItem[]): Promise<string>` — returns new doc ID
  - `getUserSets(uid): Promise<VocabSet[]>` — list all sets
  - `getSet(uid, setId): Promise<VocabSet>` — single set
  - `updateSet(uid, setId, data): Promise<void>` — partial update
  - `deleteSet(uid, setId): Promise<void>`
- [ ] **4.2** Create `frontend/src/pages/CreateSet.tsx`
  - Step 1: Name the set (text input)
  - Step 2: Select HSK levels (checkboxes for 1–7)
  - Step 3: After levels are selected, load and display all vocab from those levels
  - Step 4: User can select/deselect individual vocab items (default: all selected)
  - Step 5: "Create Set" button → calls `createSet` with selected items (all default to `status: "unlearned"`)
  - Navigate to set detail page after creation
- [ ] **4.3** Create `frontend/src/pages/SetList.tsx` (the main dashboard view)
  - Shows all user's sets as cards
  - Each card shows: set name, item count, created date, count by status (learnt/unlearned/skipped)
  - Click card → navigate to `/sets/{setId}`
  - "Create New Set" button → navigate to `/sets/new`
- [ ] **4.4** Create `frontend/src/pages/SetDetail.tsx` (placeholder for now)
  - Displays set name + item count
  - Will be expanded in Phase 5
- [ ] **4.5** Update `App.tsx` routes:
  - `/dashboard` → `<SetList />`
  - `/sets/new` → `<CreateSet />`
  - `/sets/:setId` → `<SetDetail />`
- [ ] **4.6** Implement set deletion with confirmation modal
- [ ] **4.7** Test: create a set with HSK 1 items → appears in list → navigate to detail → delete → gone

---

## Phase 5: Set Study View & Vocab Interactions

> **Goal**: Build the core study interface where users view vocab and tag learning status.

### Context
- `SetDetail.tsx` receives `setId` from route params
- Loads set doc from Firestore + hydrates items by joining with static vocab JSON
- Supports: shuffle, add vocab, remove vocab, divide into subsets

### Tasks

- [ ] **5.1** Expand `frontend/src/pages/SetDetail.tsx`:
  - Load set doc via `getSet(uid, setId)`
  - Load required vocab levels via `loadLevels(uniqueLevelsInSet)`
  - **Hydrate**: for each `VocabItem` in set, look up the full `VocabEntry` from cache and combine
  - Display as a list/table respecting global `characterType` and `visibleFields`
- [ ] **5.2** Create `frontend/src/components/VocabCard.tsx`
  - Displays a single vocab entry based on user's global preferences
  - Shows: character (simplified or traditional), selected romanization, meaning, etc.
  - Three-state tag button: unlearned (default/gray) → learnt (green) → skipped (orange) → cycles back
  - Remove from set button (X)
- [ ] **5.3** Implement **shuffle** toggle in `SetDetail.tsx`
  - Button: "Shuffle" — Fisher-Yates shuffle the items array in state
  - Reorder is client-side only; the new order gets saved to Firestore on autosave
- [ ] **5.4** Implement **add vocab** to existing set
  - Button opens a modal/drawer
  - Select levels → browse/search vocab not already in set → add selected
  - Appends new `VocabItem` entries with `status: "unlearned"`
- [ ] **5.5** Implement **divide into subsets**
  - User inputs a number (e.g., 10)
  - Client divides `items` array into chunks of that size
  - Remainder chunk at the end if not exact
  - Display as tabs or paginated sections: "Subset 1 (10)", "Subset 2 (10)", "Subset 3 (4)"
  - This is purely a **view-layer** concern — Firestore stores `subsetSize` but the actual division is computed on render
- [ ] **5.6** Implement **status tagging** (learnt / skipped / unlearned)
  - Clicking the tag on `VocabCard` updates the item's `status` in local state
  - Changes are batched and autosaved (see Phase 6)
- [ ] **5.7** Display filter/summary bar at the top:
  - "All (500) | Unlearned (350) | Learnt (120) | Skipped (30)"
  - Clicking a filter shows only items with that status
- [ ] **5.8** Test: open a set → shuffle works → tag items → filter works → add vocab → subset division renders correctly

---

## Phase 6: Autosave System

> **Goal**: Automatically persist set state to Firestore without excessive writes.

### Context
- User might tag 50 vocab items in rapid succession — don't write to Firestore 50 times
- Strategy: debounced save — after last change, wait 2 seconds, then write once
- Also save on `beforeunload` (tab close / navigate away)

### Tasks

- [ ] **6.1** Create `frontend/src/hooks/useAutosave.ts`
  ```typescript
  function useAutosave(uid: string, setId: string, setData: VocabSetDoc, delay = 2000)
  ```
  - Uses `useRef` to track latest data and a `setTimeout` for debounce
  - On data change: clear previous timeout → set new timeout → save after delay
  - On `beforeunload`: flush pending save immediately (use `navigator.sendBeacon` or sync `updateDoc`)
  - On component unmount: flush pending save
  - Returns `{ isSaving, lastSaved, error }`
- [ ] **6.2** Integrate `useAutosave` into `SetDetail.tsx`
  - Pass the current set state to the hook
  - Show subtle save indicator: "Saving..." / "Saved ✓" / "Save failed ✗"
- [ ] **6.3** Also save global preferences with autosave pattern in `GlobalSettings.tsx`
- [ ] **6.4** Test: tag several items rapidly → verify only 1 Firestore write happens after settling → close tab → reopen → state persisted

---

## Phase 7: Firestore Security Rules

> **Goal**: Replace the default permissive rules with production-ready security rules.

### Context
- Current rules allow all read/write until 2026-09-26 — MUST replace
- Follow the Firebase Firestore skill's security rules generation workflow (Phase 1–4)
- Data model: `users/{uid}` and `users/{uid}/sets/{setId}`

### Tasks

- [ ] **7.1** Read the Firestore security rules skill reference at:
  `C:\Users\YRDAM\.gemini\config\plugins\firebase\skills\firebase_firestore\references\enterprise\security_rules.md`
- [ ] **7.2** Write security rules in `firestore.rules` following the required phases:
  - **Phase 1 (Analysis)**: Document all collections, fields, types, CRUD ops, auth patterns
  - **Phase 2 (Generation)**: Write rules with:
    - Default deny
    - `isAuthenticated()` and `isOwner(userId)` helpers
    - `isValidUserDoc()` validator — character type enum, visibleFields is list of strings, size limits
    - `isValidSetDoc()` validator — name string (1–100 chars), items is list, etc.
    - Users can only read/write their own `users/{uid}` doc
    - Users can only CRUD their own `users/{uid}/sets/{setId}` subcollection
    - No public access to any collection
  - **Phase 3 (Devil's Advocate)**: Run through all 21 attack vectors from the skill reference
  - **Phase 4 (Validation)**: Validate syntax
- [ ] **7.3** Deploy rules:
  ```bash
  firebase deploy --only firestore:rules --project hsk-learning-webapp
  ```
- [ ] **7.4** Test: verify app still works with new rules, try accessing another user's data (should fail)

---

## Phase 8: UI Polish & Styling

> **Goal**: Make the app visually premium — dark mode, animations, responsive layout.

### Context
- Current `style.css` has a light/dark theme with CSS custom properties
- Read the modern web guidance skill FIRST for best practices:
  ```bash
  npx.cmd -y modern-web-guidance@latest search "modern responsive card layout"
  npx.cmd -y modern-web-guidance@latest search "dark mode toggle with CSS"
  npx.cmd -y modern-web-guidance@latest search "micro animation hover effects"
  ```

### Tasks

- [ ] **8.1** Design a cohesive color palette for the HSK learning theme
  - Consider Chinese-inspired aesthetics (red/gold accents, ink-wash backgrounds)
  - Dark mode as default with light mode toggle
- [ ] **8.2** Style the Login page — make it visually striking, not a plain form
- [ ] **8.3** Style the Dashboard / SetList — card grid with status bars, hover effects
- [ ] **8.4** Style the SetDetail / VocabCard — clean study interface, clear status colors
- [ ] **8.5** Style the CreateSet flow — multi-step with progress indicator
- [ ] **8.6** Style the GlobalSettings — modern toggles and checkboxes
- [ ] **8.7** Add loading skeletons, transitions between routes, and micro-animations
- [ ] **8.8** Make all pages responsive (mobile-first, breakpoints at 768px and 1024px)
- [ ] **8.9** Add Google Font import (e.g., Inter for UI, Noto Sans SC for Chinese characters)
- [ ] **8.10** Ensure all interactive elements have unique IDs for testing

---

## Phase 9: Final Verification & Cleanup

> **Goal**: End-to-end testing and production readiness.

### Tasks

- [ ] **9.1** Delete `auth-export-temp.json` from repo root (leftover from earlier debugging)
- [ ] **9.2** Run full build to verify TypeScript compiles: `cd frontend && npm run build`
- [ ] **9.3** End-to-end manual test flow:
  1. Fresh user → Google sign-in → user doc created with defaults
  2. Change global settings to traditional Chinese + bopomofo
  3. Create set from HSK 1 + HSK 2 → verify 491 items
  4. Shuffle set → order changes
  5. Divide into subsets of 50 → 10 subsets (9×50 + 1×41)
  6. Tag 10 items as learnt, 5 as skipped → filter works
  7. Close tab → reopen → all state preserved
  8. Add vocab from HSK 3 to existing set
  9. Remove vocab from set
  10. Delete set → confirm it's gone
  11. Sign out → try accessing dashboard URL → redirected to login
- [ ] **9.4** Review Firestore Console for data integrity
- [ ] **9.5** Update `README.md` with setup instructions, architecture overview, and screenshots

---

## Dependency Order

```
Phase 0 (Cleanup)
  └→ Phase 1 (Auth + Routing)
       ├→ Phase 2 (User Preferences)
       └→ Phase 3 (Vocab Loader)
            └→ Phase 4 (Set CRUD)
                 └→ Phase 5 (Study View)
                      └→ Phase 6 (Autosave)
Phase 7 (Security Rules) — can run in parallel after Phase 4
Phase 8 (Styling) — can run in parallel after Phase 5
Phase 9 (Final) — after all phases complete
```

---

## CLI Commands Reference

```bash
# Firebase CLI
firebase firestore:databases:list --project hsk-learning-webapp
firebase firestore:databases:create "(default)" --edition="enterprise" --location="asia-southeast1" --project hsk-learning-webapp
firebase deploy --only firestore:rules --project hsk-learning-webapp
firebase deploy --only firestore:rules --dry-run --project hsk-learning-webapp

# Dev
cd frontend && npm run dev
cd frontend && npm run build

# Modern web guidance (for UI phases)
npx.cmd -y modern-web-guidance@latest search "<query>"
npx.cmd -y modern-web-guidance@latest retrieve "<id>"
```

## Skill References (read when starting relevant phase)

| Phase | Skill File to Read |
|---|---|
| 0, 2, 4, 6 | `C:\Users\YRDAM\.gemini\config\plugins\firebase\skills\firebase_firestore\references\enterprise\web_sdk_usage.md` |
| 0 | `C:\Users\YRDAM\.gemini\config\plugins\firebase\skills\firebase_firestore\references\enterprise\provisioning.md` |
| 1 | `C:\Users\YRDAM\.gemini\config\plugins\firebase\skills\firebase_auth_basics\SKILL.md` |
| 7 | `C:\Users\YRDAM\.gemini\config\plugins\firebase\skills\firebase_firestore\references\enterprise\security_rules.md` |
| 8 | `C:\Users\YRDAM\.gemini\config\plugins\modern-web-guidance-plugin\skills\modern-web-guidance\SKILL.md` |
