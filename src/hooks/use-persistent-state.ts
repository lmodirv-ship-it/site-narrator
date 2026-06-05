import { useEffect, useState } from "react";

export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      if (value === undefined || value === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {
      /* quota / private mode — ignore */
    }
  }, [key, value]);

  const clear = () => {
    try { window.localStorage.removeItem(key); } catch { /* noop */ }
  };

  return [value, setValue, clear];
}
