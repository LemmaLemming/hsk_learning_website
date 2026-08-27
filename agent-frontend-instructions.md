# HSK Learning App — Frontend Rebuild Instructions

> **For:** A low-context-window AI agent performing iterative frontend work.
> **Rule:** Read ONLY the phase you are working on. Reference the "Codebase Map" and "Backend API" sections as needed. Do NOT read the entire file at once.

---

## ⚠️ CRITICAL: Pre-Requisites Before Starting

### 1. Backend Changes Required FIRST

The following backend changes are needed before frontend work begins. These are small and self-contained.

#### 1A. Add `createUserWithEmailAndPassword` to firebaseConfig.ts

**File:** `frontend/src/firebase/firebaseConfig.ts`

Add the import and export:
```typescript
import { getAuth, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, createUserWithEmailAndPassword } from "firebase/auth";

// Add this export at the bottom:
export const registerWithEmail = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password);
```

#### 1B. Extend UserPreferences type for onboarding

**File:** `frontend/src/types/index.ts`

Add these fields to the `UserPreferences` interface:
```typescript
export type Occupation = "student" | "working" | "professional" | "teacher" | "other";

export interface UserPreferences {
  displayName: string;
  characterType: CharacterType;
  visibleFields: VisibleField[];
  // NEW: onboarding fields
  onboardingComplete: boolean;    // default: false
  occupation: Occupation | null;  // default: null
  targetLevels: number[];         // default: [] (HSK levels 1-7)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### 1C. Update userService defaults

**File:** `frontend/src/services/userService.ts`

Update the `defaults` object in `getOrCreateUserDoc` to include:
```typescript
onboardingComplete: false,
occupation: null,
targetLevels: [],
```

Also add `onboardingComplete`, `occupation`, and `targetLevels` to the `UserPrefUpdate` interface.

#### 1D. Update Firestore security rules

**File:** `firestore.rules`

Update `isValidUserDoc` to allow the new fields:
```
data.keys().hasOnly(
  ['displayName', 'characterType', 'visibleFields', 'onboardingComplete',
   'occupation', 'targetLevels', 'createdAt', 'updatedAt'])
```
Add validations:
```
&& data.onboardingComplete is bool
&& (data.occupation == null || data.occupation in ['student', 'working', 'professional', 'teacher', 'other'])
&& data.targetLevels is list
&& data.targetLevels.size() <= 7
```

Deploy rules after updating:
```bash
firebase deploy --only firestore:rules --project hsk-learning-webapp
```

#### 1E. Add `lastAccessedAt` field to VocabSetDoc

**File:** `frontend/src/types/index.ts`

Add to `VocabSetDoc`:
```typescript
lastAccessedAt: Timestamp | null;  // set when user opens the set
```

**File:** `frontend/src/services/setService.ts`

Update `createSet` to include `lastAccessedAt: null` in the initial doc.
Add a function:
```typescript
export async function touchSet(uid: string, setId: string): Promise<void> {
  await updateDoc(setRef(uid, setId), { lastAccessedAt: serverTimestamp() });
}
```

Update `getUserSets` to order by `updatedAt` (already does `createdAt`) or add a separate `getRecentSets` that orders by `lastAccessedAt`.

**File:** `firestore.rules`

Add `'lastAccessedAt'` to the `isValidSetDoc` `keys().hasOnly(...)` list.

### 2. Install drag-and-drop library

```bash
cd frontend && npm install @hello-pangea/dnd
npm install --save-dev @types/react @types/react-dom
```

> `@hello-pangea/dnd` is the maintained fork of `react-beautiful-dnd`. It works with React 19. Do NOT use `react-beautiful-dnd` (unmaintained).

### 3. Verify build passes after backend changes

```bash
cd frontend && npm run build
```

Fix any TypeScript errors before proceeding to frontend phases.

---

## Codebase Map (Reference — read when needed)

```
frontend/src/
├── App.tsx                          # React Router: /login, /dashboard, /settings, /sets/new, /sets/:setId
├── main.tsx                         # Entry: BrowserRouter + AuthProvider
├── style.css                        # Global CSS (Chinese-ink theme, dark default)
├── contexts/
│   └── AuthContext.tsx              # onAuthStateChanged, useAuth(), signOut
├── components/
│   ├── Login.tsx                    # Email sign-in + Google sign-in
│   ├── ProtectedRoute.tsx           # Auth guard
│   ├── GlobalSettings.tsx           # Character type toggle + field checkboxes
│   ├── VocabCard.tsx                # Single vocab display + 3-state status cycle
│   └── AddVocabModal.tsx            # Modal to add vocab to existing set
├── pages/
│   ├── SetList.tsx                  # Dashboard: lists user's sets
│   ├── CreateSet.tsx                # 4-step wizard: Name → Levels → Review → Create
│   ├── SetDetail.tsx                # Study view: shuffle, subset, filter, autosave
│   └── Settings.tsx                 # Full-page settings wrapper
├── services/
│   ├── userService.ts              # getOrCreateUserDoc, updateUserPreferences
│   ├── setService.ts               # CRUD: createSet, getUserSets, getSet, updateSet, deleteSet
│   └── vocabLoader.ts              # Fetch + cache static JSON: loadLevel, loadLevels, getVocabById
├── hooks/
│   ├── useAutosave.ts              # 2s debounced save + beforeunload flush
│   └── useVocabData.ts             # React wrapper around vocabLoader with loading state
├── types/
│   └── index.ts                    # VocabEntry, VocabItem, VocabSetDoc, UserPreferences, etc.
├── utils/
│   └── vocab.ts                    # formOf, characterFor, displayFor helpers
└── firebase/
    └── firebaseConfig.ts           # Firebase init, auth, db, analytics exports
```

### Static vocab data
- Located at `frontend/public/data/{1-7}.min.json`
- Fetched via `fetch('/data/1.min.json')` → cached in memory by `vocabLoader.ts`
- Vocab entry shape: `{ id, s (simplified), r (radical), q (frequency), p (POS), f (forms[]) }`
- Each form: `{ t (traditional), i: { y (pinyin), n, w, b, g }, m (meanings[]), c (classifiers[]) }`

### Backend API (Firestore services — DO NOT REWRITE, just call them)

| Function | File | What it does |
|---|---|---|
| `signInWithGoogle()` | `firebaseConfig.ts` | Google popup sign-in |
| `signInWithEmail(email, pw)` | `firebaseConfig.ts` | Email/password sign-in |
| `registerWithEmail(email, pw)` | `firebaseConfig.ts` | **NEW** — Email registration |
| `getOrCreateUserDoc(user)` | `userService.ts` | Returns UserPreferences (creates with defaults if new) |
| `updateUserPreferences(uid, prefs)` | `userService.ts` | Partial update to user doc |
| `createSet(uid, name, items)` | `setService.ts` | Creates set, returns ID |
| `getUserSets(uid)` | `setService.ts` | Returns all sets ordered by createdAt desc |
| `getSet(uid, setId)` | `setService.ts` | Returns single set |
| `updateSet(uid, setId, data)` | `setService.ts` | Partial update (autosave calls this) |
| `deleteSet(uid, setId)` | `setService.ts` | Deletes set |
| `touchSet(uid, setId)` | `setService.ts` | **NEW** — Updates lastAccessedAt timestamp |
| `loadLevel(n)` / `loadLevels([n])` | `vocabLoader.ts` | Fetches and caches vocab JSON |
| `getVocabById(level, id)` | `vocabLoader.ts` | Lookup from cache |
| `useAutosave(saveFn, data, delay)` | `useAutosave.ts` | Debounced autosave hook |
| `useAuth()` | `AuthContext.tsx` | Returns `{ user, loading, signOut }` |

---

## Design System: Retro Early-2000s Raw HTML

### Design Principles
- **NO modern UI frameworks**. No Material UI, no Chakra, no Tailwind.
- Monospaced font for headings: `"Courier New", Courier, monospace`
- Body font: system default serif or `Georgia, "Times New Roman", serif`
- Background: solid light color like `#f0f0f0` or `#e8e8e8` with optional tiled GIF pattern
- Borders: `2px solid #333` or `3px ridge #999` (the ridge/groove/inset border styles are key to the retro feel)
- Buttons: `<button>` styled with `background: #ddd; border: 2px outset #999;` push-button style
- Links: blue `#0000EE`, visited `#551A8B`, underlined always
- Tables with visible borders: `border-collapse: collapse; border: 1px solid black`
- `<hr>` as thick horizontal rules with `border: 2px inset`
- `<marquee>` effect for fun announcements (CSS animation, not actual `<marquee>`)
- ASCII art rendered in `<pre>` blocks with monospace font
- Page width: `max-width: 800px; margin: 0 auto` — centered column, not full-width
- Color palette: `#f0f0f0` bg, `#333` text, `#0000EE` links, `#cc0000` for accents, `#006600` for success
- Form inputs: `border: 2px inset #ccc; background: #fff; font-family: inherit`
- No border-radius anywhere (sharp corners only)
- Subtle visitor counter at the bottom: `"You are visitor #____ | Page last updated: ____"`
- Use `<fieldset>` and `<legend>` for form grouping
- `<table>` for layout in specific retro sections (e.g., set cards as table rows)

### Google Fonts to Load
Replace the current Inter + Noto Sans SC with:
```html
<link href="https://fonts.googleapis.com/css2?family=VT323&family=Noto+Sans+SC:wght@400;700&display=swap" rel="stylesheet">
```
- `VT323` — pixel/terminal monospace font for headings and ASCII art
- Keep `Noto Sans SC` for Chinese characters

### CSS Variables (replace existing `:root`)
```css
:root {
  --bg: #e8e8e8;
  --bg-card: #ffffff;
  --text: #333333;
  --text-dim: #666666;
  --link: #0000EE;
  --link-visited: #551A8B;
  --accent: #cc0000;
  --success: #006600;
  --warn: #cc6600;
  --border: #999999;
  --border-dark: #333333;
  --input-bg: #ffffff;
  --input-border: #aaaaaa;
  --font-mono: "VT323", "Courier New", Courier, monospace;
  --font-body: Georgia, "Times New Roman", Times, serif;
  --font-hanzi: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
}
```

---

## Phase 1: Login Page Overhaul

> **Goal:** Retro login page with ASCII cat art, registration button, Google SSO.

### What to modify

**File:** `frontend/src/components/Login.tsx` — Complete rewrite of JSX and logic.

### Specification

1. **ASCII Cat Art Background**
   - Render a `<pre>` block behind/above the login form with ASCII art of cats
   - Example cats (use these exactly or similar):
   ```
       /\_/\     /\_/\     /\_/\
      ( o.o )   ( o.o )   ( o.o )
       > ^ <     > ^ <     > ^ <
      /|   |\   /|   |\   /|   |\
     (_|   |_) (_|   |_) (_|   |_)
   ```
   - Wrap in a `<pre className="ascii-cats">` and style with `font-family: var(--font-mono); color: var(--text-dim); text-align: center;`

2. **Page title:** `<h1>` in VT323 font: `"=== HSK Vocab Trainer ==="`

3. **Login section** wrapped in `<fieldset><legend>Login</legend>...</fieldset>`
   - Email input, password input, "Sign In" button
   - Calls existing `signInWithEmail(email, password)`

4. **Registration section** wrapped in `<fieldset><legend>New User? Register</legend>...</fieldset>`
   - Email input, password input, confirm password input
   - "Register" button → calls `registerWithEmail(email, password)` (from prerequisite 1A)
   - Validate passwords match before calling
   - On success, the `onAuthStateChanged` listener auto-logs them in

5. **Google SSO** — a separate button below: `[ Sign in with Google ]`
   - Calls existing `signInWithGoogle()`
   - Styled as a retro outset button

6. **Error display:** Red text in a `<pre>` block: `*** ERROR: {message} ***`

7. **Footer:** `<hr>` then small text: `"Best viewed with Netscape Navigator 4.0 | © 2026 HSK Vocab Trainer"`

### CSS classes to add to `style.css`
- `.login-page` — centered layout, `max-width: 500px`, `margin: 0 auto`, `padding: 40px 20px`
- `.ascii-cats` — `font-family: var(--font-mono); font-size: 14px; color: var(--text-dim); white-space: pre; text-align: center; margin-bottom: 20px; line-height: 1.2;`
- `fieldset` — `border: 2px groove var(--border); padding: 16px; margin-bottom: 16px;`
- `legend` — `font-family: var(--font-mono); font-weight: bold; padding: 0 8px;`
- `.retro-btn` — `font-family: var(--font-mono); padding: 8px 16px; border: 2px outset var(--border); background: #ddd; cursor: pointer; font-size: 14px;`
- `.retro-btn:active` — `border-style: inset;` (push effect)
- `.retro-input` — `border: 2px inset var(--input-border); background: var(--input-bg); padding: 6px 8px; font-family: var(--font-body); font-size: 14px; width: 100%;`

---

## Phase 2: Onboarding Flow (First-Time Login)

> **Goal:** After first login, if `onboardingComplete === false`, show a quiz before dashboard.

### What to create

**New file:** `frontend/src/pages/Onboarding.tsx`

### Specification

1. **Route:** Add `/onboarding` to `App.tsx` as a protected route
2. **Guard:** In the dashboard (`SetList.tsx`), after loading user prefs, check:
   - If `prefs.onboardingComplete === false` → `<Navigate to="/onboarding" />`
3. **Step 1: "Who are you?"**
   - Radio buttons in a `<fieldset><legend>Step 1: Tell us about yourself</legend>`:
     - Student, Working, Professional, Teacher, Other
   - "Next >>" button
4. **Step 2: "Which HSK levels are you studying?"**
   - Checkboxes for HSK 1–7 in a `<fieldset><legend>Step 2: Select your HSK levels</legend>`
   - "Finish >>" button
5. **On finish:**
   - Call `updateUserPreferences(uid, { occupation, targetLevels, onboardingComplete: true })`
   - Navigate to `/dashboard`
6. **Styling:** Same retro `<fieldset>` + `<legend>` pattern, `.retro-btn` buttons, table layout for radio options

### Backend calls used:
- `getOrCreateUserDoc(user)` — to check `onboardingComplete`
- `updateUserPreferences(uid, prefs)` — to save quiz results
- These already exist. No new backend code needed beyond prerequisite 1B/1C.

---

## Phase 3: Dashboard Overhaul

> **Goal:** Retro dashboard with "pick up where you left off" panels, set list table, create button.

### What to modify

**File:** `frontend/src/pages/SetList.tsx` — Major rewrite of JSX and layout.

### Specification

1. **Header section:**
   ```
   ╔══════════════════════════════════╗
   ║   HSK VOCAB TRAINER DASHBOARD   ║
   ╚══════════════════════════════════╝
   ```
   Rendered as `<pre className="ascii-header">` in VT323 font

2. **"Pick Up Where You Left Off" section**
   - Show the 2 most recently accessed sets (by `lastAccessedAt` field — see prerequisite 1E)
   - Render as two large `<table>` "panels" side by side
   - Each panel shows: set name, item count, progress bar (% learnt), last accessed date
   - Clicking navigates to `/sets/{setId}`
   - If fewer than 2 sets exist, show a message: `"No recent sets. Create one below!"`
   - Call `touchSet(uid, setId)` in `SetDetail.tsx` on mount to update `lastAccessedAt`

3. **"Your Sets" section**
   - Render as an HTML `<table>` with columns: `#`, `Name`, `Items`, `Learnt`, `Skipped`, `Created`, `Actions`
   - Each row is clickable → navigates to `/sets/{setId}`
   - Actions column: `[Delete]` link (styled as retro link, triggers confirmation)
   - If no sets: `"You haven't created any sets yet."`
   - Above the table: `[ + Create New Set ]` retro button → `/sets/new`

4. **Settings button:** `[ ⚙ Settings ]` button in the header → opens a modal (not a separate page)

5. **Global Settings as modal/popup (not separate page)**
   - Instead of navigating to `/settings`, show a modal overlay when clicking Settings
   - Reuse `<GlobalSettings>` component inside the modal
   - Modal uses retro styling: `border: 3px ridge var(--border); background: var(--bg-card);`

6. **Delete confirmation:** Use `window.confirm()` for the retro feel instead of a custom modal

7. **Footer:** Visitor counter: `"Page hits: 9999 | Last updated: {date}"`

### CSS for retro table:
```css
.retro-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-body);
}
.retro-table th, .retro-table td {
  border: 1px solid var(--border-dark);
  padding: 6px 10px;
  text-align: left;
}
.retro-table th {
  background: #ccc;
  font-family: var(--font-mono);
  font-weight: bold;
}
.retro-table tr:hover {
  background: #ddd;
  cursor: pointer;
}
```

---

## Phase 4: Create New Set Page

> **Goal:** Retro multi-step set creation with level selection, per-level vocab browsing, search.

### What to modify

**File:** `frontend/src/pages/CreateSet.tsx` — Rewrite JSX. Keep existing logic (it works).

### Specification

1. **Step indicator:** Plain text: `"Step 1 of 4: Name Your Set"` (not fancy stepper pills)

2. **Step 1 — Name:**
   - `<fieldset><legend>Set Name</legend>` with text input
   - `[Next >>]` button

3. **Step 2 — Select Levels:**
   - `<fieldset><legend>Select HSK Levels</legend>`
   - 7 checkboxes in a `<table>` layout:
     | ☐ | HSK 1 | 294 words |
     | ☐ | HSK 2 | 197 words |
     | ... | ... | ... |
   - Each level row is expandable: clicking the level name opens a sub-view showing all vocab in that level (fetch via `loadLevel(n)`)
   - In the expanded sub-view: search bar (search by simplified character or pinyin), select/deselect individual words
   - `[Next >>]` button

4. **Step 3 — Review:**
   - Show count: `"Selected: 491 words from 2 levels"`
   - Full list in a scrollable `<table>`: `#`, `Character`, `Pinyin`, `Meaning`, `Level`, `☐`
   - Search bar to filter the review list
   - `[Select All]` and `[Clear All]` links

5. **Step 4 — Create:**
   - `[Create Set]` button → calls `createSet()` → navigates to `/sets/{newId}`

### Backend calls used:
- `loadLevel(n)` / `loadLevels([...])` — fetch vocab JSON (already exists)
- `createSet(uid, name, items)` — create set (already exists)
- All existing logic in `CreateSet.tsx` is correct. Only restyle the JSX.

---

## Phase 5: Set Detail (Study View) Page

> **Goal:** Add drag-and-drop reordering, "daily decks" split, retro styling. Keep existing logic.

### What to modify

**File:** `frontend/src/pages/SetDetail.tsx` — Add drag-drop, enhance styling.
**File:** `frontend/src/components/VocabCard.tsx` — Restyle to retro.

### Specification

1. **Drag and drop reordering**
   - Use `@hello-pangea/dnd` (installed in prerequisite step 2)
   - Import: `import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";`
   - Wrap the vocab list in `<DragDropContext>` → `<Droppable>` → each card in `<Draggable>`
   - On drag end, reorder the `items` array in state. The autosave hook will persist the new order.
   - Show a drag handle icon on each card: `⠿` or `☰` (rendered as a `<span className="drag-handle">`)

2. **"Daily Decks" split (renamed from "subsets")**
   - Label: `"Split into daily decks of ___ words each"`
   - When split, render each subset as a `<fieldset><legend>Day 1 (10 words)</legend>`
   - Drag-and-drop works within each deck but NOT between decks

3. **Controls bar (retro style):**
   ```
   [Shuffle] [Split into decks: [___] [Go]] [+ Add vocab]
   ```
   All `.retro-btn` styled

4. **Status filter bar:**
   ```
   Show: (ALL 500) | (Unlearned 350) | (Learnt 120) | (Skipped 30)
   ```
   Rendered as `<a>` links with underline, active one is bold

5. **VocabCard retro restyle:**
   - Border: `2px solid var(--border-dark)`, no border-radius
   - Status indicator: `[UNLEARNED]` / `[LEARNT ✓]` / `[SKIPPED →]` as text labels
   - Remove button: `[X]` link
   - Character in large font with `font-family: var(--font-hanzi)`
   - Fields listed vertically, each on its own line with a label

6. **Autosave indicator:** `"Saving..."` / `"Saved."` / `"ERROR: save failed"` in retro text at top

7. **Back navigation:** `"<< Back to Dashboard"` as a retro underlined link

### Backend calls used:
- `getSet(uid, setId)` — load set (exists)
- `updateSet(uid, setId, data)` — autosave (exists, called via `useAutosave`)
- `touchSet(uid, setId)` — update lastAccessedAt on mount (NEW, prerequisite 1E)
- `getOrCreateUserDoc(user)` — load prefs (exists)
- `loadLevels(levels)` — hydrate vocab (exists)
- `getVocabById(level, id)` — lookup (exists)

### `@hello-pangea/dnd` usage pattern:
```tsx
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

function onDragEnd(result: DropResult) {
  if (!result.destination) return;
  setItems(prev => {
    const arr = [...prev];
    const [removed] = arr.splice(result.source.index, 1);
    arr.splice(result.destination!.index, 0, removed);
    return arr;
  });
}

// In JSX:
<DragDropContext onDragEnd={onDragEnd}>
  <Droppable droppableId="vocab-list">
    {(provided) => (
      <div ref={provided.innerRef} {...provided.droppableProps}>
        {items.map((item, index) => (
          <Draggable key={`${item.level}:${item.vocabId}`} draggableId={`${item.level}:${item.vocabId}`} index={index}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.draggableProps}>
                <span {...provided.dragHandleProps}>⠿</span>
                {/* VocabCard content */}
              </div>
            )}
          </Draggable>
        ))}
        {provided.placeholder}
      </div>
    )}
  </Droppable>
</DragDropContext>
```

---

## Phase 6: Global CSS Overhaul

> **Goal:** Replace the entire `style.css` with the retro early-2000s theme.

### What to modify

**File:** `frontend/src/style.css` — Complete replacement.
**File:** `frontend/index.html` — Update Google Fonts link.

### Key CSS rules to implement

```css
/* GLOBAL RESET */
* { box-sizing: border-box; margin: 0; padding: 0; }

/* BODY */
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.6;
}

/* LINKS — always underlined, blue */
a { color: var(--link); text-decoration: underline; }
a:visited { color: var(--link-visited); }
a:hover { color: var(--accent); }

/* HEADINGS — monospace */
h1, h2, h3 {
  font-family: var(--font-mono);
  margin-bottom: 12px;
}

/* HR — retro inset */
hr {
  border: none;
  border-top: 2px inset var(--border);
  margin: 16px 0;
}

/* PAGE CONTAINER */
.page {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px 16px 60px;
  background: var(--bg-card);
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  min-height: 100vh;
}
```

### Important: Remove ALL border-radius
Search and replace `border-radius: ...px;` with nothing. The retro style uses sharp corners exclusively.

### Remove all modern effects
- No `transform: translateY()` hover effects
- No `box-shadow` (except `inset` for buttons)
- No gradients on buttons
- No transitions/animations (except the marquee text)
- No `backdrop-filter`

---

## Phase 7: App.tsx Routing Updates

> **Goal:** Add onboarding route, remove separate settings page.

### What to modify

**File:** `frontend/src/App.tsx`

### Changes:
1. Add `/onboarding` as a protected route → `<Onboarding />`
2. Remove the `/settings` route (settings will be a modal in dashboard)
3. Keep all other routes as-is

```tsx
import Onboarding from "./pages/Onboarding";

// In Routes:
<Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
```

---

## Phase 8: Verification

> **Goal:** Ensure everything builds and works.

### Tasks:
1. Run `cd frontend && npm run build` — must pass with zero errors
2. Run `cd frontend && npm run dev` — verify in browser:
   - Login page shows ASCII cats, register form, Google button
   - New user → onboarding quiz → dashboard
   - Dashboard shows retro table of sets, "pick up where you left off"
   - Create new set → level selection with per-level expansion → review → create
   - Set detail → drag and drop works, daily decks split works, status cycling works
   - Autosave indicator shows "Saving..." then "Saved."
   - Settings modal opens/closes from dashboard
   - Sign out returns to login
3. Check Firestore Console: verify user docs have new onboarding fields

### Known issue to fix:
- Google Sign-In may fail on `localhost` with "unauthorized domain" error
- **Fix:** Go to Firebase Console → Authentication → Settings → Authorized Domains → Add `localhost`
- OR in `firebase.json`, add:
  ```json
  "auth": {
    "providers": {
      "googleSignIn": {
        "authorizedRedirectUris": ["http://localhost"]
      }
    }
  }
  ```
  Then deploy: `firebase deploy --only auth --project hsk-learning-webapp`

---

## Skill References

| Phase | Skill to read FIRST |
|---|---|
| 5 (Drag-drop) | `npm info @hello-pangea/dnd` — check API. Import `DragDropContext`, `Droppable`, `Draggable`. |
| 1-5 (All React) | React 19 docs: hooks (`useState`, `useEffect`, `useMemo`, `useRef`) |
| 1B, 1D (Firestore) | Read `C:\Users\YRDAM\.gemini\config\plugins\firebase\skills\firebase_firestore\references\enterprise\security_rules.md` |
| 6 (CSS) | Run `npx.cmd -y modern-web-guidance@latest search "retro web design CSS"` — but likely no results; this is a deliberate anti-modern design. Use your knowledge of 2000s CSS. |

---

## Order of Execution

```
Prerequisites (1A → 1B → 1C → 1D → 1E → install DnD → verify build)
  └→ Phase 6 (CSS overhaul — do this first so all pages look right)
       └→ Phase 1 (Login page)
            └→ Phase 2 (Onboarding)
                 └→ Phase 3 (Dashboard)
                      └→ Phase 4 (Create Set)
                           └→ Phase 5 (Set Detail + drag-drop)
                                └→ Phase 7 (Routing cleanup)
                                     └→ Phase 8 (Verification)
```
