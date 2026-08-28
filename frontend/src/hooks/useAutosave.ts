import { useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Debounced autosave: after `data` changes, wait `delay` ms, then call `save`.
 * Also flushes a pending save on `beforeunload` and on unmount.
 *
 * `enabled` gates autosaving (e.g. pass `loaded` so populating state after a
 * fetch doesn't trigger a spurious save). While disabled, the "first data"
 * skip is NOT consumed, so the first save after enabling is also skipped.
 */
export function useAutosave<T>(
  save: () => Promise<void>,
  data: T,
  delay = 2000,
  enabled = true
) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const timerRef = useRef<number | undefined>(undefined);
  const first = useRef(true);

  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    return saveRef
      .current()
      .then(() => setStatus("saved"))
      .catch((e: unknown) => {
        setStatus("error");
        setError((e as Error).message);
      });
  };

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus("saving");
    timerRef.current = window.setTimeout(() => {
      void flush();
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, delay, enabled]);

  useEffect(() => {
    const onBeforeUnload = () => {
      void flush();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, error, flush };
}
