import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../firebase/firebaseConfig";
import {
  DEFAULT_VISIBLE_FIELDS,
  type CharacterType,
  type Occupation,
  type UserPreferences,
  type VisibleField,
} from "../types";

const now = () => serverTimestamp() as unknown as UserPreferences["createdAt"];

export function userDocRef(uid: string) {
  return doc(db, "users", uid);
}

export interface UserPrefUpdate {
  characterType?: CharacterType;
  visibleFields?: VisibleField[];
  onboardingComplete?: boolean;
  occupation?: Occupation | null;
  targetLevels?: number[];
}

export async function getOrCreateUserDoc(
  user: User
): Promise<UserPreferences> {
  const ref = userDocRef(user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() as UserPreferences;
    // If the doc predates the onboarding fields (e.g. created before the
    // rules update), merge in the defaults so the Firestore rules still
    // accept future writes to it.
    if (data.onboardingComplete == null || data.occupation === undefined || data.targetLevels === undefined) {
      const migrated: UserPreferences = {
        ...data,
        onboardingComplete: data.onboardingComplete ?? false,
        occupation: data.occupation ?? null,
        targetLevels: data.targetLevels ?? [],
      };
      await setDoc(ref, migrated, { merge: true });
      return migrated;
    }
    return data;
  }
  const defaults: UserPreferences = {
    displayName: user.displayName ?? user.email ?? "User",
    characterType: "simplified",
    visibleFields: DEFAULT_VISIBLE_FIELDS,
    onboardingComplete: false,
    occupation: null,
    targetLevels: [],
    createdAt: now(),
    updatedAt: now(),
  };
  await setDoc(ref, defaults);
  return defaults;
}

export async function updateUserPreferences(
  uid: string,
  prefs: UserPrefUpdate
): Promise<void> {
  await updateDoc(userDocRef(uid), {
    ...prefs,
    updatedAt: serverTimestamp(),
  });
}
