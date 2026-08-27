# HSK Learning App

An HSK (Chinese proficiency) vocabulary learning web app. Authenticated users
create custom vocabulary **sets** from the static HSK 1–7 word lists, adjust
display preferences (simplified/traditional, which fields to show), and study
sets with per-set controls (shuffle, divide into subsets, add/remove vocab).
Each word is tagged **unlearned / learnt / skipped**, and progress auto-saves to
Cloud Firestore so it persists across sessions.

## Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** Firebase Auth (Email/Password + Google) + Cloud Firestore
- **Database:** Firestore `(default)` database, `asia-southeast1` (Singapore)

## Architecture: minimal backend work

- HSK vocab data (`hsk_vocab_list/*.min.json`) is copied into
  `frontend/public/data/` and served as **static assets** by Vite. It is never
  stored in Firestore.
- Firestore stores **only**:
  - `users/{uid}` — global display preferences
  - `users/{uid}/sets/{setId}` — set metadata + lightweight vocab references
    (`{ level, vocabId, status }`).
- All filtering, shuffling, subset division, and hydration (joining references
  with static JSON) happen **client-side**.
- Firestore writes are **debounced** (2s) and flushed on tab close/unmount.

## Firestore data model

```
users/{uid}
  displayName: string
  characterType: "simplified" | "traditional"
  visibleFields: string[]   // pinyin, toneNumber, wadeGiles, bopomofo,
                            // gwoyeu, meaning, partsOfSpeech, radical,
                            // frequency, classifiers
  createdAt / updatedAt: Timestamp

users/{uid}/sets/{setId}
  name: string
  shuffled: boolean
  subsetSize: number | null
  createdAt / updatedAt: Timestamp
  items: [{ level: number, vocabId: number, status: "unlearned"|"learnt"|"skipped" }]
```

## Project layout

```
frontend/
  src/
    main.tsx                 # entry; BrowserRouter + AuthProvider
    App.tsx                  # routes
    style.css                # theme (Chinese ink + cinnabar)
    context/AuthContext.tsx  # onAuthStateChanged + useAuth()
    components/              # Login, ProtectedRoute, VocabCard, GlobalSettings,
                             # AddVocabModal
    pages/                   # SetList (dashboard), Settings, CreateSet, SetDetail
    services/                # userService, setService, vocabLoader
    hooks/                   # useVocabData, useAutosave
    utils/vocab.ts           # display helpers (character + field rendering)
    firebase/firebaseConfig.ts
firestore.rules              # Firestore security rules
firebase.json                # Firebase config
hsk_vocab_list/              # source HSK 1-7 JSON
```

## Setup

1. **Install dependencies**

   ```bash
   cd frontend
   npm install
   ```

2. **Configure Firebase env vars**

   Copy `.env.example` to `.env` and fill in your Firebase web-app values:

   ```bash
   cp .env.example .env
   ```

   Required: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
   `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`,
   `VITE_FIREBASE_MEASUREMENT_ID`.

3. **Enable Firebase services (one-time)**

   - Enable **Email/Password** and **Google** providers in
     Firebase Console → Authentication → Sign-in method.
   - Create the Firestore database (already done for this project):

     ```bash
     firebase firestore:databases:create "(default)" \
       --edition="standard" --location="asia-southeast1" \
       --project <project-id>
     ```

4. **Deploy Firestore rules**

   ```bash
   firebase deploy --only firestore:rules --project <project-id>
   ```

## Run locally

```bash
cd frontend
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build      # tsc && vite build
npm run preview
```

## Security rules

`firestore.rules` (deployed) provides a secure-by-default prototype:

- **No public/anonymous access.** Everything requires authentication.
- Users may only read/write their **own** `users/{uid}` doc and their own
  `users/{uid}/sets/{setId}` subcollection.
- **Strict schema** via `keys().hasOnly(...)` — no extra fields can be injected
  (which also blocks role/privilege escalation since no role fields exist).
- **Data validation:** string length caps, enum checks, list-size caps to
  prevent 1 MB+ resource-exhaustion writes.
- `createdAt` is **immutable** on update.

> ⚠️ These are **prototype** rules and should be reviewed before publishing to a
> broad audience. The rules language has no loops, so individual elements of the
> `items` array can't be schema-validated inside rules — only the list type and
> overall size cap are enforced there. Consider server-side validation if you
> need strict per-item enforcement.

## Testing / verification checklist

1. Sign in with Google → app creates `users/{uid}` with defaults.
2. Change display prefs (traditional + bopomofo) → doc updates.
3. Create a set from HSK 1 + HSK 2 (491 items) → appears in list.
4. Shuffle → order changes and persists.
5. Divide into subsets of 50 → 10 subsets (9×50 + 1×41).
6. Tag items learnt/skipped → filters work.
7. Close tab / reopen → state preserved (autosave flush).
8. Add vocab from HSK 3 to an existing set; remove vocab.
9. Delete a set.
10. Sign out → protected routes redirect to `/login`.
