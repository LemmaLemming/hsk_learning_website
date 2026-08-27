#
Technical Report — HSK Learning App Build

**Project:** `hsk_learning_website` · **Firebase project:** `hsk-learning-webapp` · **Date:** 2026-08-27
**Stack:** React 19 + TypeScript + Vite 8, Firebase Auth + Cloud Firestore (web SDK v12), Firebase CLI 15.28.1 (logged in as `hchen1122@gmail.com`).

---

## 1. Preflight

- Verified Firebase CLI present (`15.28.1`) and authenticated.
- Confirmed nothing sensitive was already committed (see earlier git-audit turn), and `auth-export-temp.json` had been made git-ignored.
- Confirmed the `(default)` Firestore database **did not exist** yet → needed provisioning.
- Read the installed `firebase` skill (`maton`/Management-API flavor) — noted it targets project/app management, not runtime DB ops, so runtime work used the Firebase CLI + SDK directly.
- Read the referenced Firestore skill reference (`web_sdk_usage.md`, `security_rules.md`) from `~/.gemini/config/plugins/firebase/...`.

---

## 2. Phase 0 — Cleanup & Infrastructure

**Tasks:** delete `counter.ts`; provision Firestore; copy HSK JSON; add `getFirestore`; install router; verify dev server.

- Deleted `frontend/src/counter.ts` (unused Vite scaffold).
- Copied `hsk_vocab_list/*.min.json` → `frontend/public/data/` (7 files, served as static assets).
- Added `getFirestore(app)` export to `frontend/src/firebase/firebaseConfig.ts`.
- Installed `react-router-dom@7.18.2`.
- Confirmed `tsc`/Vite boot cleanly.

**Error encountered & fixed:**
- The todo's exact command
  `firestore:databases:create "(default)" --edition="enterprise"` failed with
  `400 ... Firestore Enterprise requires a named database not a (default)`.
  **Fix:** created `(default)` with `--edition="standard"` instead (correct because the web SDK and rules use the default DB). Documented the deviation to the user.

---

## 3. Phase 1 — Auth State & Routing

New: `contexts/AuthContext.tsx` (`onAuthStateChanged`, `useAuth()`, `signOut`), `components/ProtectedRoute.tsx` (loading spinner, redirect), `pages/…`, rewrote `App.tsx` (routes `/login`, `/dashboard`, `/settings`, `/sets/new`, `/sets/:setId`, `/` + catch-all) and `main.tsx` (`BrowserRouter` + `AuthProvider`). Login redirects already-authenticated users away.

**Fixed pre-existing errors:** the todo's `tsc` had `TS6133` unused-`React` imports in `App.tsx`/`main.tsx`; these disappeared once I rewrote both files (project uses `react-jsx`, so `React` import is unnecessary).

---

## 4. Phase 2 — User Preferences

New `types/index.ts` (all data models incl. `VocabEntry` matching the JSON schema), `services/userService.ts` (`getOrCreateUserDoc`, `updateUserPreferences` using `serverTimestamp`), `components/GlobalSettings.tsx`. Wired load/save through a new `pages/Settings.tsx`.

---

## 5. Phase 3 — Vocab Loader

`services/vocabLoader.ts` (in-memory `Map` cache, `loadLevel/loadLevels/getVocabById`) and `hooks/useVocabData.ts` (loading/error state keyed on a sorted level key).

---

## 6. Phases 4–6 — Sets CRUD, Study View, Autosave

- `services/setService.ts` (create/get/list/update/delete).
- `pages/SetList.tsx` (set cards, status counts, delete-confirmation modal), `pages/CreateSet.tsx` (5-step wizard with search + select-all), `components/AddVocabModal.tsx`.
- `pages/SetDetail.tsx`: hydration (join references with static JSON), `components/VocabCard.tsx` (3-state tag cycle, remove), shuffle, subset division, status filter bar.
- `hooks/useAutosave.ts`: **2-second debounce** + flush on `beforeunload` and unmount; integrated into SetDetail for all state writes.

---

## 7. Phase 7 — Firestore Security Rules

Wrote `firestore.rules` following the reference workflow (data-model doc → helpers → rules → devil's advocate → validation).

**Errors encountered & fixed (3 rule-compiler issues):**
1. **`Unexpected 'match'`** — the file omitted the required top-level wrapper. **Fix:** wrapped in `service cloud.firestore { match /databases/{database}/documents { … } }`. (Discovered the real message via a minimal-file repro: `mismatched input 'match' expecting {'function','import','service'}`.)
2. **`Invalid function name: all` / `Unused function` warnings** — I originally validated array contents with `list.all(...)`. The rules compiler rejects `.all()` because **Firestore rules have no loops** (confirmed via searxng search + StackOverflow). **Fix:** removed `.all()` from `isValidSetDoc` and `isValidUserDoc`; kept `is list` + `size() <= 20000`/`<= 10` caps for DoS protection, and documented the per-element-validation limitation.
3. After removing the second `.all()`, clean compile (no warnings). **Deployed** via `firebase deploy --only firestore:rules`.

Final rules: owner-only access via `isOwner(userId)`, strict `keys().hasOnly(...)` schema (blocks extra-field injection / privilege escalation), enum/length/size validation, immutable `createdAt` on update, no anonymous access.

---

## 8. Phase 8 — Styling

Replaced the Vite-scaffold `style.css` with a full Chinese-inspired theme (ink + cinnabar/gold, dark-default with light-mode media query, card grids, modals, stepper, study view, responsive breakpoints at 768/480px). Updated `index.html` (title + Google Fonts: Inter + Noto Sans SC). Branded the login page.

---

## 9. Phase 9 — Verification & Cleanup

- Deleted `auth-export-temp.json` from repo root (already git-ignored → safe).
- **`npm run build` passes** (`tsc && vite build`, 62 modules, ~813 kB JS — only a non-blocking chunk-size warning from the Firebase SDK).
- Dev server boots cleanly.
- Wrote full `README.md` (setup, architecture, data model, rules, testing checklist).

**Deferred to the human (cannot be automated without a browser):** 9.3 end-to-end Google sign-in test and 9.4 Firestore Console data review — detailed instructions were provided and I stopped there as requested.

---

## Key decisions & deviations from the todo
- **Enterprise → Standard** for the `(default)` DB (the documented Enterprise command is invalid for `(default)`).
- **Per-item array validation dropped** in rules (rules language limitation); enforced list type + size cap instead and documented honestly.
- **Auth/DB access** followed the matured phases even when the todo's per-phase "test" steps needed a browser — consolidated those into the final E2E handoff.

---

One more thing: this whole Firebase build ran as a smooth multi-step workflow. Want me to **save it as a reusable skill** (`firebase-webapp-build` via the Skill Workshop) so a future project can reuse the exact steps, rule patterns, and the two pitfalls I hit (Enterprise-vs-default DB, no-loops-in-rules)? I'll only create it if you'd like.