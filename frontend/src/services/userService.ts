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
  DEFAULT_FLASHCARD_FRONT_FIELDS,
  DEFAULT_FLASHCARD_BACK_FIELDS,
  type CharacterType,
  type Occupation,
  type PageSize,
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
  flashcardFrontFields?: VisibleField[];
  flashcardBackFields?: VisibleField[];
  pageSize?: PageSize;
  onboardingComplete?: boolean;
  occupation?: Occupation | null;
  targetLevels?: number[];
  hasSeenCreateSetTutorial?: boolean;
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
    if (
      data.onboardingComplete == null ||
      data.occupation === undefined ||
      data.targetLevels === undefined ||
      data.pageSize === undefined ||
      data.flashcardFrontFields === undefined ||
      data.flashcardBackFields === undefined ||
      data.hasSeenCreateSetTutorial === undefined
    ) {
      const migrated: UserPreferences = {
        ...data,
        pageSize: data.pageSize ?? 50,
        flashcardFrontFields:
          data.flashcardFrontFields ?? DEFAULT_FLASHCARD_FRONT_FIELDS,
        flashcardBackFields:
          data.flashcardBackFields ?? DEFAULT_FLASHCARD_BACK_FIELDS,
        onboardingComplete: data.onboardingComplete ?? false,
        occupation: data.occupation ?? null,
        targetLevels: data.targetLevels ?? [],
        hasSeenCreateSetTutorial: data.hasSeenCreateSetTutorial ?? false,
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
    flashcardFrontFields: DEFAULT_FLASHCARD_FRONT_FIELDS,
    flashcardBackFields: DEFAULT_FLASHCARD_BACK_FIELDS,
    pageSize: 50,
    onboardingComplete: false,
    occupation: null,
    targetLevels: [],
    hasSeenCreateSetTutorial: false,
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
