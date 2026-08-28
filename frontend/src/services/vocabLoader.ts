import type { VocabEntry } from "../types";

const cache = new Map<number, VocabEntry[]>();
// Secondary index: level -> (id -> entry) for O(1) lookups.
const indexCache = new Map<number, Map<number, VocabEntry>>();

function buildIndex(level: number, entries: VocabEntry[]): void {
  const map = new Map<number, VocabEntry>();
  for (const e of entries) map.set(e.id, e);
  indexCache.set(level, map);
}

export async function loadLevel(level: number): Promise<VocabEntry[]> {
  const cached = cache.get(level);
  if (cached) return cached;
  const res = await fetch(`/data/${level}.min.json`);
  if (!res.ok) {
    throw new Error(`Failed to load level ${level}: HTTP ${res.status}`);
  }
  const data = (await res.json()) as VocabEntry[];
  cache.set(level, data);
  buildIndex(level, data);
  return data;
}

export async function loadLevels(
  levels: number[]
): Promise<Map<number, VocabEntry[]>> {
  const unique = [...new Set(levels)];
  await Promise.all(unique.map(loadLevel));
  return cache;
}

export function getVocabById(
  level: number,
  id: number
): VocabEntry | undefined {
  return indexCache.get(level)?.get(id);
}

export function getCacheLevel(level: number): VocabEntry[] | undefined {
  return cache.get(level);
}
