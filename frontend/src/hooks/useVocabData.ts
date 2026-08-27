import { useEffect, useState } from "react";
import { loadLevels } from "../services/vocabLoader";
import type { VocabEntry } from "../types";

interface State {
  data: Map<number, VocabEntry[]>;
  loading: boolean;
  error: string | null;
}

export function useVocabData(levels: number[]): State {
  const [state, setState] = useState<State>({
    data: new Map(),
    loading: true,
    error: null,
  });
  const key = [...levels].sort((a, b) => a - b).join(",");

  useEffect(() => {
    let active = true;
    const requested = key ? key.split(",").map(Number) : [];
    if (requested.length === 0) {
      setState({ data: new Map(), loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    loadLevels(requested)
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (active)
          setState((s) => ({
            ...s,
            loading: false,
            error: (e as Error).message,
          }));
      });
    return () => {
      active = false;
    };
  }, [key]);

  return state;
}
