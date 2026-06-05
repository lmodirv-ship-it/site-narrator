import { useEffect, useState } from "react";

export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore malformed/localStorage errors */
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (value === undefined || value === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {
      /* quota / private mode — ignore */
    }
  }, [hydrated, key, value]);

  const clear = () => {
    try { window.localStorage.removeItem(key); } catch { /* noop */ }
  };

  return [value, setValue, clear];
}
