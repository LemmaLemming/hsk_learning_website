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
}

export async function getOrCreateUserDoc(
  user: User
): Promise<UserPreferences> {
  const ref = userDocRef(user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data() as UserPreferences;
  }
  const defaults: UserPreferences = {
    displayName: user.displayName ?? user.email ?? "User",
    characterType: "simplified",
    visibleFields: DEFAULT_VISIBLE_FIELDS,
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
