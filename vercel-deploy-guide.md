# HSK Vocab Trainer — Vercel Deployment Guide

## Security Audit Result: ✅ Safe to commit and push

No secrets or sensitive credentials found in any tracked file. Full audit:

| Check | Result |
|---|---|
| Hard-coded API keys (AIza*, sk-*, bearer tokens) | ✅ None found |
| `.env` file tracked | ✅ Not tracked — excluded by `frontend/.gitignore` |
| `firebase.json` tracked | ✅ Not tracked — excluded by root `.gitignore` |
| `.firebaserc` tracked | ✅ Not tracked — excluded by root `.gitignore` |
| `node_modules/` tracked | ✅ Not tracked |
| `dist/` tracked | ✅ Not tracked |
| `firebaseConfig.ts` values | ✅ All values read from `import.meta.env.VITE_*` — no literals |
| `.env.example` tracked | ✅ Safe — contains only placeholder variable names, no values |

All `VITE_FIREBASE_*` keys are loaded at **build time** from environment variables, not from source code. The `firebaseConfig.ts` file only contains `import.meta.env.*` references.

> **Note on Firebase API keys:** Firebase web API keys are inherently public — they identify the project but do not grant access. Security is enforced by **Firestore rules** (already deployed) and **Firebase Auth** (only authenticated users can read/write). The real risk would be if a `.env` file were committed — it isn't.

---

## Deploy to Vercel — Step-by-Step

### Prerequisites

- A [Vercel account](https://vercel.com) (free tier works)
- The GitHub repo pushed to a GitHub account (push your local commits first)
- Your Firebase project values from the Firebase Console

---

### Step 1: Push your latest commits to GitHub

```bash
git push origin main
```

Confirm all commits are pushed (`git log --oneline` should match the remote).

---

### Step 2: Get your Firebase config values

1. Go to [Firebase Console](https://console.firebase.google.com) → select project **hsk-learning-webapp**
2. Click the **gear icon** (⚙) → **Project settings**
3. Scroll to **Your apps** → select your web app (or create one if none exists)
4. Under **SDK setup and configuration** → select **Config** (not CDN)
5. You will see an object like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "hsk-learning-webapp.firebaseapp.com",
     projectId: "hsk-learning-webapp",
     storageBucket: "hsk-learning-webapp.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef",
     measurementId: "G-XXXXXXXXXX"
   };
   ```
6. Copy each value — you'll paste them into Vercel in Step 4.

---

### Step 3: Import the repo into Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Select your GitHub account and find **hsk_learning_website**
4. Click **Import**

---

### Step 4: Configure the project settings

Vercel will show a **Configure Project** screen. Set these exactly:

| Setting | Value |
|---|---|
| **Framework Preset** | `Vite` |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` (Vercel auto-detects this) |
| **Output Directory** | `dist` (Vercel auto-detects this) |
| **Install Command** | `npm install` (Vercel auto-detects this) |
| **Node.js Version** | 20.x (or latest LTS — match what you have locally) |

> **Critical:** Set Root Directory to `frontend`. The Vite project is in the subdirectory, not the repo root. If you skip this, the build will fail because `package.json` is in `frontend/`, not `/`.

---

### Step 5: Add environment variables

Still on the Configure Project screen, expand **Environment Variables** and add each one:

| Variable Name | Where to find the value |
|---|---|
| `VITE_FIREBASE_API_KEY` | `apiKey` from Firebase config object |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` from Firebase config object |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` from Firebase config object |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` from Firebase config object |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` from Firebase config object |
| `VITE_FIREBASE_APP_ID` | `appId` from Firebase config object |
| `VITE_FIREBASE_MEASUREMENT_ID` | `measurementId` from Firebase config object |

For each variable:
1. Click **+ Add** 
2. Paste the name (e.g. `VITE_FIREBASE_API_KEY`) in the **Key** field
3. Paste the value from Firebase in the **Value** field
4. Leave **Environment** as `Production, Preview, Development` (all three)

---

### Step 6: Deploy

Click **Deploy**. The build takes ~1 minute. You'll see:

```
Running "npm run build"
> tsc && vite build
✓ built in ~4s
```

When complete, Vercel gives you a URL like `https://hsk-vocab-trainer-xxxx.vercel.app`.

---

### Step 7: Add your Vercel domain to Firebase Auth

Firebase Auth blocks sign-in from unlisted domains. You must whitelist your Vercel URL.

1. Go to [Firebase Console](https://console.firebase.google.com) → **Authentication** → **Settings** tab
2. Scroll to **Authorized domains**
3. Click **Add domain** and add:
   - `hsk-vocab-trainer-xxxx.vercel.app` ← your specific Vercel URL
   - `*.vercel.app` ← optional, covers all preview deployments
4. Click **Add**

> Without this step, **Google Sign-In will fail** with an "unauthorized domain" error. Email/password login also requires this for redirect-based flows.

---

### Step 8: Verify the deployment

Open your Vercel URL and test the full flow:

- [ ] Login page loads (ASCII cats visible, VT323 font loaded)
- [ ] Register a new account with email/password
- [ ] Onboarding quiz completes and redirects to dashboard
- [ ] Google Sign-In works (if it fails, recheck Step 7)
- [ ] Create a new vocab set — choose HSK levels, review, create
- [ ] Open the set — cards load, flashcard mode activates if split into decks
- [ ] Status changes auto-save ("Saving..." → "Saved.")
- [ ] Sign out → redirected to login page

---

### Step 9 (optional): Add a custom domain

1. In Vercel → your project → **Settings** → **Domains**
2. Click **Add** → enter your domain (e.g. `hsk.yourdomain.com`)
3. Follow Vercel's DNS instructions (add a CNAME record at your registrar)
4. Add the custom domain to Firebase Auth authorized domains (Step 7 again, with the new domain)

---

## Automatic re-deploys (CI/CD)

Once connected, Vercel **automatically redeploys** on every push to `main`. Preview deployments are created for every pull request.

You do NOT need to run any deploy command manually going forward. Just:
```bash
git push origin main
```
...and Vercel handles the rest.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Build fails: `Cannot find module` | Root directory not set to `frontend` | Vercel settings → Edit → Root Directory → `frontend` |
| Build fails: TS errors | Uncommitted code that doesn't type-check | Run `npm run build` locally first, fix errors, push |
| Blank page after deploy | Env variables missing | Vercel → Settings → Environment Variables — check all 7 are set |
| Google Sign-In fails: "unauthorized domain" | Vercel domain not whitelisted in Firebase | Firebase Console → Auth → Settings → Authorized Domains → Add your `.vercel.app` URL |
| Firebase writes fail silently | Firestore rules not deployed | Run `npx -y firebase-tools@latest deploy --only firestore:rules` from repo root |
| Fonts not loading | Google Fonts blocked by ad blocker | Test in incognito; fonts are loaded from `fonts.googleapis.com` in `index.html` |
| `getAnalytics is not supported` error | Firebase Analytics doesn't support server-side environments | Not applicable for Vercel (client-side SPA) — if seen, ensure Vite build target is `browser` |

---

## Environment variables reference

For future reference, here are all 7 required variables with descriptions:

```env
# Firebase Web App SDK config — get all values from:
# Firebase Console > Project Settings > Your Apps > Web App > Config

VITE_FIREBASE_API_KEY=          # Identifies your Firebase project (public, not a secret)
VITE_FIREBASE_AUTH_DOMAIN=      # e.g. your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=       # e.g. hsk-learning-webapp
VITE_FIREBASE_STORAGE_BUCKET=   # e.g. your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=  # Numeric sender ID for FCM (Cloud Messaging)
VITE_FIREBASE_APP_ID=           # e.g. 1:1234567890:web:abcdef123456
VITE_FIREBASE_MEASUREMENT_ID=   # e.g. G-XXXXXXXXXX (Google Analytics / Firebase Analytics)
```

All variables are prefixed `VITE_` so Vite includes them in the client bundle at build time. Variables without the `VITE_` prefix are NOT exposed to the browser.
