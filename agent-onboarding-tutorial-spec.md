# HSK Learning App — Onboarding Tutorial Spec

> **Goal:** Give a low-context-window AI agent a compact, self-contained plan for adding an in-app onboarding tutorial that uses arrowed message popups ("coach marks") to guide the user through the **Create Set** demo.
>
> **Rule:** Read this file ONLY. Do not read the full codebase. The sections below contain the exact file paths, state shapes, CSS conventions, and step-by-step tutorial flow needed to implement the feature.

---

## 1. What already exists (minimal context)

The app is a retro-styled HSK vocab trainer. After login, users land on `/dashboard`.
From there they can click **"+ Create New Set"** to open `/sets/new`.

The **Create Set** page (`frontend/src/pages/CreateSet.tsx`) is a 4-step wizard:

1. **Name** — text input for the set name.
2. **Levels** — 7 checkboxes for HSK 1–7; each level can expand to browse/search its words.
3. **Review** — scrollable table of selected words with a search box.
4. **Create** — summary + `[ Create Set ]` button.

Relevant existing files (read only these when implementing):

| File | Purpose |
|---|---|
| `frontend/src/pages/CreateSet.tsx` | The 4-step wizard to annotate. |
| `frontend/src/pages/SetList.tsx` | Dashboard; tutorial starts from the **+ Create New Set** button. |
| `frontend/src/types/index.ts` | `UserPreferences` type; add `hasSeenCreateSetTutorial` here. |
| `frontend/src/services/userService.ts` | `getOrCreateUserDoc`, `updateUserPreferences`; persist the flag. |
| `frontend/src/style.css` | Retro theme CSS; add tutorial popup styles here. |

---

## 2. Feature: Create Set demo tutorial

When a **new user** (or any user who hasn't seen the tutorial) clicks **"+ Create New Set"**, show a sequence of arrowed popups that explain the wizard as they use it.

### 2.1 Required new state

Add a flag to the user preferences:

```typescript
// frontend/src/types/index.ts inside UserPreferences
hasSeenCreateSetTutorial: boolean; // default: false
```

Update defaults + migrations in `frontend/src/services/userService.ts`:

```typescript
hasSeenCreateSetTutorial: false,
```

Update the `UserPrefUpdate` interface to allow:

```typescript
hasSeenCreateSetTutorial?: boolean;
```

Also add the field to `firestore.rules` `isValidUserDoc` under the `keys().hasOnly(...)` list:

```
'hasSeenCreateSetTutorial'
```

And validate:

```
&& data.hasSeenCreateSetTutorial is bool
```

Deploy rules:

```bash
firebase deploy --only firestore:rules --project hsk-learning-webapp
```

### 2.2 Tutorial steps

The tutorial has **5 popups**. Each popup has:
- A short title
- One-sentence body text
- A primary action button (`Next` or `Got it`)
- An optional secondary `Skip tour` link
- A small arrow (CSS border triangle) pointing at the highlighted element

| # | Anchor element | Popup title | Body | Primary action |
|---|---|---|---|---|
| 1 | **+ Create New Set** button on dashboard | Create your first set | Sets let you study the exact HSK words you want. Click here to build one. | Next |
| 2 | **Set Name** input on `/sets/new` step 0 | Name your set | Pick any name, like "HSK 1 Beginner". | Next |
| 3 | **HSK level checkboxes / browse row** on step 1 | Choose a level | Tick an HSK level, then click its name to expand and browse words. | Next |
| 4 | **Review table** on step 2 | Review your selection | Search, tick, or untick words. You can always edit the set later. | Next |
| 5 | **Create Set** button on step 3 | You're ready | Press this to create the set and start studying. | Got it |

After step 5 (or if the user clicks **Skip tour** at any point), persist:

```typescript
await updateUserPreferences(uid, { hasSeenCreateSetTutorial: true });
```

---

## 3. Implementation notes for a low-context agent

### 3.1 New reusable component

Create `frontend/src/components/TutorialPopover.tsx`.

Props:

```typescript
interface TutorialPopoverProps {
  targetSelector: string;     // e.g. "[data-tour='create-btn']"
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  onSkip?: () => void;
  placement?: "top" | "bottom" | "left" | "right";
  stepNumber: number;
  totalSteps: number;
}
```

The component should:
1. Find the target DOM element with `document.querySelector(targetSelector)`.
2. Measure its `getBoundingClientRect()`.
3. Render a fixed-position popup near the target.
4. Include an arrow pointing toward the target using CSS border triangles.
5. Block interaction with the rest of the page with a semi-transparent overlay.
6. Allow clicking the highlighted target itself (use `pointer-events: none` on the overlay except for a cut-out, OR simply don't block clicks and rely on the user following the prompt).

> **Simplest reliable approach:** render an overlay `div` covering the whole screen with `pointer-events: none`, then render the popup at the computed position with `pointer-events: auto`. This keeps the UI visible and the user can still click the highlighted button.

### 3.2 Positioning helper

```typescript
function computePosition(
  target: DOMRect,
  placement: "top" | "bottom" | "left" | "right",
  popupW: number,
  popupH: number
) {
  const gap = 12;
  switch (placement) {
    case "top":
      return { left: target.left + target.width / 2 - popupW / 2, top: target.top - popupH - gap };
    case "bottom":
      return { left: target.left + target.width / 2 - popupW / 2, top: target.bottom + gap };
    case "left":
      return { left: target.left - popupW - gap, top: target.top + target.height / 2 - popupH / 2 };
    case "right":
      return { left: target.right + gap, top: target.top + target.height / 2 - popupH / 2 };
  }
}
```

Recompute on window resize and scroll (use `useEffect` with a `resize`/`scroll` listener or a short `requestAnimationFrame` loop).

### 3.3 Data attributes for anchors

Add stable `data-tour` attributes so the popover can find elements without reading complex component internals:

| Step | File | Attribute to add |
|---|---|---|
| 1 | `SetList.tsx` | `<button data-tour="create-btn" ...>+ Create New Set</button>` |
| 2 | `CreateSet.tsx` | `<input id="set-name" data-tour="set-name-input" ... />` |
| 3 | `CreateSet.tsx` | On the first HSK row: `<tr data-tour="level-row" ...>` |
| 4 | `CreateSet.tsx` | `<div className="review-scroll" data-tour="review-table" ...>` |
| 5 | `CreateSet.tsx` | Create button on step 3: `<button data-tour="create-set-btn" ...>` |

### 3.4 Tutorial state machine in `CreateSet.tsx`

Add local state:

```typescript
const [tourStep, setTourStep] = useState<number | null>(null);
```

When the component mounts, check `user` preferences. If `hasSeenCreateSetTutorial === false`, start the tour:

```typescript
useEffect(() => {
  if (prefs && prefs.hasSeenCreateSetTutorial === false && step === 0) {
    setTourStep(2); // jump to step 2 (Name input) because step 1 was on dashboard
  }
}, [prefs, step]);
```

The dashboard handles step 1: when `hasSeenCreateSetTutorial === false`, render `<TutorialPopover targetSelector="[data-tour='create-btn']" ... />` immediately.

After the dashboard step finishes, navigate to `/sets/new`. The CreateSet page detects the unfinished tour and continues from step 2.

### 3.5 Advancing / skipping

- **Next:** increment `tourStep`. If the next step is on a different wizard step of CreateSet, also update `step` state to the matching wizard step.
- **Skip tour:** call `updateUserPreferences(uid, { hasSeenCreateSetTutorial: true })` and set `tourStep(null)`.
- **Got it:** same as Skip tour.

Map:

```typescript
const TOUR_FLOW = [
  { selector: "[data-tour='create-btn']",        wizardStep: null, page: "/dashboard" },
  { selector: "[data-tour='set-name-input']",    wizardStep: 0,    page: "/sets/new" },
  { selector: "[data-tour='level-row']",         wizardStep: 1,    page: "/sets/new" },
  { selector: "[data-tour='review-table']",      wizardStep: 2,    page: "/sets/new" },
  { selector: "[data-tour='create-set-btn']",    wizardStep: 3,    page: "/sets/new" },
];
```

`wizardStep` is the 0-based `step` state inside `CreateSet.tsx`. The tour engine should set `setStep(wizardStep)` when entering that tour step.

---

## 4. CSS to add to `style.css`

```css
/* ---------- TUTORIAL POPOVER ---------- */
.tutorial-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 90;
  pointer-events: none;
}

.tutorial-popover {
  position: fixed;
  z-index: 100;
  width: 280px;
  background: var(--bg-card);
  border: 3px ridge var(--border-dark);
  padding: 14px;
  font-family: var(--font-body);
  pointer-events: auto;
  box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.25); /* retro hard shadow */
}

.tutorial-popover h4 {
  font-family: var(--font-mono);
  font-size: 18px;
  margin-bottom: 8px;
}

.tutorial-popover p {
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 12px;
}

.tutorial-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tutorial-skip {
  font-size: 12px;
  color: var(--text-dim);
}

.tutorial-step-count {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
}

/* Arrow base */
.tutorial-arrow {
  position: absolute;
  width: 0;
  height: 0;
  border-style: solid;
}

/* Arrow pointing UP (popover below target) */
.tutorial-popover[data-placement="bottom"] .tutorial-arrow {
  top: -10px;
  left: 50%;
  margin-left: -10px;
  border-width: 0 10px 10px 10px;
  border-color: transparent transparent var(--border-dark) transparent;
}

/* Arrow pointing DOWN (popover above target) */
.tutorial-popover[data-placement="top"] .tutorial-arrow {
  bottom: -10px;
  left: 50%;
  margin-left: -10px;
  border-width: 10px 10px 0 10px;
  border-color: var(--border-dark) transparent transparent transparent;
}

/* Arrow pointing RIGHT (popover left of target) */
.tutorial-popover[data-placement="right"] .tutorial-arrow {
  left: -10px;
  top: 50%;
  margin-top: -10px;
  border-width: 10px 10px 10px 0;
  border-color: transparent var(--border-dark) transparent transparent;
}

/* Arrow pointing LEFT (popover right of target) */
.tutorial-popover[data-placement="left"] .tutorial-arrow {
  right: -10px;
  top: 50%;
  margin-top: -10px;
  border-width: 10px 0 10px 10px;
  border-color: transparent transparent transparent var(--border-dark);
}
```

Keep the retro theme: sharp corners, ridge border, hard shadow, VT323 monospace headings, no `border-radius`.

---

## 5. Files to modify (checklist)

- [ ] `frontend/src/types/index.ts` — add `hasSeenCreateSetTutorial: boolean`.
- [ ] `frontend/src/services/userService.ts` — default `false`, add to `UserPrefUpdate`, migrate old docs.
- [ ] `firestore.rules` — add field to `keys().hasOnly(...)` and `is bool` validation; deploy.
- [ ] `frontend/src/components/TutorialPopover.tsx` — new reusable popup component.
- [ ] `frontend/src/pages/SetList.tsx` — add `data-tour="create-btn"` and render step 1 popup when flag is false.
- [ ] `frontend/src/pages/CreateSet.tsx` — add `data-tour` anchors and tour state machine.
- [ ] `frontend/src/style.css` — add `.tutorial-*` styles.

---

## 6. Verification

1. `cd frontend && npm run build` passes with zero TypeScript errors.
2. Create a fresh user (or clear `hasSeenCreateSetTutorial` to `false` in Firestore Console).
3. On the dashboard, the **+ Create New Set** button shows a popup.
4. Click **Next** → navigates to `/sets/new` → popup appears on the **Set Name** input.
5. Advance through all 5 steps; each popup points at the correct element.
6. Click **Skip tour** at any point → the flag is saved and the tour does not reappear on reload.
7. Repeat with an existing user where `hasSeenCreateSetTutorial === true` → no popups.

---

## 7. Optional future extensions (out of scope)

- Highlight the target element with a pulsing ring.
- Add a global "Replay tour" button in Settings.
- Extend the tour to the study view (`SetDetail.tsx`) to explain status tags and daily decks.
- Use React context to centralize tour state across pages.

---

## 8. Single-page quick reference

```typescript
// types
hasSeenCreateSetTutorial: boolean;

// user service default
hasSeenCreateSetTutorial: false,

// rules
'hasSeenCreateSetTutorial'
&& data.hasSeenCreateSetTutorial is bool

// anchors
data-tour="create-btn"
data-tour="set-name-input"
data-tour="level-row"
data-tour="review-table"
data-tour="create-set-btn"

// close tour
await updateUserPreferences(uid, { hasSeenCreateSetTutorial: true });
```
