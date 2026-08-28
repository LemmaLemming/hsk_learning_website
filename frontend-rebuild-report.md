# HSK Learning App — Frontend Rebuild Report

**Date:** 2026-08-28
**Repo:** `C:\Users\YRDAM\Documents\GitHub\hsk_learning_website`
**Instructions followed:** `agent-frontend-instructions.md`
**Status:** Code complete ✅ · Build passes ✅ · Rules deployed ✅ · GUI testing **pending (human)**

---

## 1. Summary

Executed the full retro frontend rebuild per `agent-frontend-instructions.md`:
all backend prerequisites (1A–1E), the drag-and-drop library install, all
frontend phases (1–7), and pre-verification (Phase 8 build + dev-server smoke
test). The only remaining work is interactive GUI testing in a browser, which
requires a human (live Firebase auth + console access).

## 2. Backend Prerequisites (all done)

| # | Change | File(s) | Status |
|---|---|---|---|
| 1A | `registerWithEmail()` export | `frontend/src/firebase/firebaseConfig.ts` | ✅ |
| 1B | `Occupation` type + onboarding fields on `UserPreferences`; `lastAccessedAt` on `VocabSetDoc` | `frontend/src/types/index.ts` | ✅ |
| 1C | Onboarding defaults + `UserPrefUpdate` fields | `frontend/src/services/userService.ts` | ✅ |
| 1D | Rules: new user-doc fields/validations, `lastAccessedAt` on sets | `firestore.rules` → **deployed** to `hsk-learning-webapp` | ✅ |
| 1E | `createSet` writes `lastAccessedAt: null`; `touchSet()`; `getRecentSets()` | `frontend/src/services/setService.ts` | ✅ |
| 2 | Installed `@hello-pangea/dnd` (React-19-compatible maintained fork) | `frontend/package.json` | ✅ |
| 3 | `npm run build` passes with zero TS errors after backend changes | — | ✅ |

**Deviations (minimal, deliberate):**

- **`getRecentSets(uid, 2)` added as a separate function** instead of changing
  `getUserSets` ordering — the dashboard needs both the full retro table
  (createdAt desc) and the recent-2 panels (lastAccessedAt desc).
- **Legacy user-doc migration** in `getOrCreateUserDoc`: docs created before the
  rules update lack the new fields, and the new rules would reject writes to
  them (`data.onboardingComplete is bool` fails on a missing field). On read,
  the service now merges in `onboardingComplete: false`, `occupation: null`,
  `targetLevels: []` with `setDoc(..., { merge: true })` so existing users
  aren't locked out.

## 3. Frontend Phases (all done)

Executed in the order prescribed by the instructions (CSS first, routing last):

| Phase | What changed | Status |
|---|---|---|
| 6 — CSS overhaul | `style.css` fully replaced with retro early-2000s theme (VT323 mono, serif body, `#e8e8e8` bg, restyled outset/inset buttons, ridge/groove fieldsets, retro tables, marquee, visitor counter, no border-radius); `index.html` fonts → VT323 + Noto Sans SC; title → "HSK Vocab Trainer" | ✅ |
| 1 — Login | ASCII cat art `<pre>`, `=== HSK Vocab Trainer ===` title, Login fieldset (email/password → `signInWithEmail`), Register fieldset with password-match validation (→ `registerWithEmail`), Google SSO button, `*** ERROR: … ***` display, Netscape footer | ✅ |
| 2 — Onboarding | New `pages/Onboarding.tsx`: step 1 occupation radios (table layout), step 2 HSK 1–7 level checkboxes, saves via `updateUserPreferences` → navigates to `/dashboard`; dashboard guard redirects `onboardingComplete === false` users to `/onboarding` | ✅ |
| 3 — Dashboard | `SetList.tsx` rewrite: ASCII header, welcome marquee, "Pick Up Where You Left Off" recent-2 panels (name/items/progress bar/last accessed) with `getRecentSets`, "Your Sets" retro table (#, Name, Items, Learnt, Skipped, Created, Actions) with clickable rows + `window.confirm` delete, `[ + Create New Set ]`, Settings **modal** reusing `<GlobalSettings>` (separate `/settings` page gone), visitor-counter footer | ✅ |
| 4 — Create Set | `CreateSet.tsx` restyled: "Step N of 4" text indicator, fieldset/legend per step, level table with word counts (static map; matches `public/data/*.min.json`), **expandable level rows** with lazy `loadLevel(n)` + per-level search and word toggles, review step with scrollable table (#, Character, Pinyin, Meaning, Level, ☐), Select All / Clear All, existing create logic kept | ✅ |
| 5 — Set Detail | `SetDetail.tsx`: `DragDropContext`/`Droppable`/`Draggable` from `@hello-pangea/dnd`, drag handle `⠿`, reorder persists via autosave; **daily decks** split ("Day N (x words)" fieldsets, reorder within deck only, never across); retro controls `[Shuffle] [Split into daily decks of __ [Go]] [+ Add vocab]`; status filter links with counts; `touchSet()` on mount; autosave indicator "Saving…/Saved./ERROR". `VocabCard.tsx` restyled: `[UNLEARNED]/[LEARNT ✓]/[SKIPPED →]` tags, `[X]` remove link, large hanzi character, labelled vertical fields, 3-state cycle kept | ✅ |
| 7 — Routing | `App.tsx`: `/onboarding` protected route added; `/settings` route removed; orphaned `pages/Settings.tsx` deleted | ✅ |

## 4. Verification (Phase 8)

| Check | Result |
|---|---|
| `npm run build` (tsc + vite) | ✅ zero errors |
| `firebase deploy --only firestore:rules` | ✅ compiled + released |
| Dev server (`npm run dev`, port 5173) | ✅ running; all 11 modules returned HTTP 200, no transform errors |

> Note: `getRecentSets` orders by `lastAccessedAt` (single-field order — no
> composite index needed).

## 5. ⏳ Pending — HUMAN: GUI testing

Browser + live-Firebase/console interaction is best done by a person. Dev
server is left running at **http://localhost:5173/**. Steps handed to the
human:

1. **Firebase Console prerequisite:** Authentication → Settings → Authorized
   Domains → add `localhost` (fixes the known Google Sign-In
   "unauthorized domain" error). The instructions' `firebase.json` auth
   alternative was **not** used — the Firebase CLI does not support deploying
   auth provider settings; Console is the reliable fix.
2. **Walk the full flow:** register → onboarding quiz → dashboard →
   create set (browse/expand levels, review) → study view (drag reorder,
   shuffle, daily decks, status cycle, filters, add vocab, autosave
   indicator) → settings modal → delete → sign out.
3. **Firestore Console check:** user docs contain `onboardingComplete`,
   `occupation`, `targetLevels`; sets contain `lastAccessedAt` (updates on
   open).

## 6. Repo State

- Commit `a22846b` — "Retro frontend rebuild: onboarding, dashboard,
  drag-drop study view, retro CSS" (17 files, +1954/−765). **Committed
  locally, NOT pushed** to `origin/main`.
- Dev server process still running (session `nova-glade`, localhost:5173).