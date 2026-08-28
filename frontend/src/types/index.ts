import type { Timestamp } from "firebase/firestore";

/** One entry from the static {level}.min.json vocab files. */
export interface VocabForm {
  t?: string; // traditional character(s)
  i?: {
    y?: string; // pinyin (default display)
    n?: string; // pinyin with tone number
    w?: string; // Wade-Giles
    b?: string; // bopomofo / zhuyin
    g?: string; // Gwoyeu Romatzyh
  };
  m?: string[]; // meanings
  c?: string[]; // classifiers (measure words)
}

export interface VocabEntry {
  id: number;
  s: string; // simplified character(s)
  r?: string; // radical
  q?: number; // frequency rank
  p?: string[]; // parts of speech
  f?: VocabForm[]; // forms (can be multiple)
}

export type CharacterType = "simplified" | "traditional";

export const ALL_VISIBLE_FIELDS = [
  "pinyin",
  "toneNumber",
  "wadeGiles",
  "bopomofo",
  "gwoyeu",
  "meaning",
  "partsOfSpeech",
  "radical",
  "frequency",
  "classifiers",
] as const;

export type VisibleField = (typeof ALL_VISIBLE_FIELDS)[number];

export const DEFAULT_VISIBLE_FIELDS: VisibleField[] = ["pinyin", "meaning"];

export type Occupation =
  | "student"
  | "working"
  | "professional"
  | "teacher"
  | "other";

export const OCCUPATIONS: Occupation[] = [
  "student",
  "working",
  "professional",
  "teacher",
  "other",
];

export interface UserPreferences {
  displayName: string;
  characterType: CharacterType;
  visibleFields: VisibleField[];
  // New: onboarding fields
  onboardingComplete: boolean; // default: false
  occupation: Occupation | null; // default: null
  targetLevels: number[]; // default: [] (HSK levels 1-7)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type VocabStatus = "unlearned" | "learnt" | "skipped";

/** A light reference stored in Firestore; joined with static JSON at render. */
export interface VocabItem {
  level: number;
  vocabId: number;
  status: VocabStatus;
}

export interface VocabSetDoc {
  name: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  shuffled: boolean;
  subsetSize: number | null;
  lastAccessedAt: Timestamp | null; // set when user opens the set
  items: VocabItem[];
}

/** A hydrated vocab item: reference + full entry joined from static JSON. */
export interface HydratedVocabItem {
  item: VocabItem;
  entry: VocabEntry;
}
