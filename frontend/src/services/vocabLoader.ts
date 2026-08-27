import type { VocabEntry } from "../types";

const cache = new Map<number, VocabEntry[]>();

export async function loadLevel(level: number): Promise<VocabEntry[]> {
  const cached = cache.get(level);
  if (cached) return cached;
  const res = await fetch(`/data/${level}.min.json`);
  if (!res.ok) {
    throw new Error(`Failed to load level ${level}: HTTP ${res.status}`);
  }
  const data = (await res.json()) as VocabEntry[];
  cache.set(level, data);
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
  return cache.get(level)?.find((e) => e.id === id);
}

export function getCacheLevel(level: number): VocabEntry[] | undefined {
  return cache.get(level);
}
