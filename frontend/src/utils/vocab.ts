import type {
  CharacterType,
  VisibleField,
  VocabEntry,
  VocabForm,
} from "../types";

export function formOf(entry: VocabEntry): VocabForm | undefined {
  return entry.f?.[0];
}

export function characterFor(
  entry: VocabEntry,
  characterType: CharacterType
): string {
  if (characterType === "traditional") {
    return formOf(entry)?.t || entry.s;
  }
  return entry.s;
}

export function displayFor(
  entry: VocabEntry,
  field: VisibleField
): string {
  const form = formOf(entry);
  switch (field) {
    case "pinyin":
      return form?.i?.y ?? "";
    case "toneNumber":
      return form?.i?.n ?? "";
    case "wadeGiles":
      return form?.i?.w ?? "";
    case "bopomofo":
      return form?.i?.b ?? "";
    case "gwoyeu":
      return form?.i?.g ?? "";
    case "meaning":
      return form?.m?.join("; ") ?? "";
    case "partsOfSpeech":
      return entry.p?.join(", ") ?? "";
    case "radical":
      return entry.r ?? "";
    case "frequency":
      return entry.q != null ? String(entry.q) : "";
    case "classifiers":
      return form?.c?.join(", ") ?? "";
    default:
      return "";
  }
}
