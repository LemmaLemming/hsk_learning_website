import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit as limitTo,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import type { VocabItem, VocabSetDoc } from "../types";

export type SetWithId = VocabSetDoc & { id: string };

const setsRef = (uid: string) => collection(db, "users", uid, "sets");
const setRef = (uid: string, setId: string) =>
  doc(db, "users", uid, "sets", setId);

export async function createSet(
  uid: string,
  name: string,
  items: VocabItem[]
): Promise<string> {
  const ref = await addDoc(setsRef(uid), {
    name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    shuffled: false,
    subsetSize: null,
    lastAccessedAt: null,
    lastDeckPage: null,
    items,
  });
  return ref.id;
}

export async function getUserSets(uid: string): Promise<SetWithId[]> {
  const q = query(setsRef(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as SetWithId
  );
}

/** Most recently accessed sets, newest first (never-accessed sets sort last). */
export async function getRecentSets(
  uid: string,
  limitCount = 2
): Promise<SetWithId[]> {
  const q = query(
    setsRef(uid),
    orderBy("lastAccessedAt", "desc"),
    limitTo(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as SetWithId
  );
}

export async function getSet(uid: string, setId: string): Promise<SetWithId> {
  const ref = setRef(uid, setId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Set not found");
  return { id: snap.id, ...snap.data() } as SetWithId;
}

export async function updateSet(
  uid: string,
  setId: string,
  data: Partial<VocabSetDoc>
): Promise<void> {
  await updateDoc(setRef(uid, setId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSet(uid: string, setId: string): Promise<void> {
  await deleteDoc(setRef(uid, setId));
}

/** Updates the lastAccessedAt timestamp when a user opens a set. */
export async function touchSet(uid: string, setId: string): Promise<void> {
  await updateDoc(setRef(uid, setId), {
    lastAccessedAt: serverTimestamp(),
  });
}

/** Persists the last studied deck page index (0-indexed). Fire-and-forget. */
export async function saveLastPage(
  uid: string,
  setId: string,
  lastDeckPage: number
): Promise<void> {
  await updateDoc(setRef(uid, setId), { lastDeckPage });
}
