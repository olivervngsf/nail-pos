"use client";
import { useEffect, useRef, useState } from "react";

/**
 * useState that saves to this device (localStorage) after every change.
 * Offline-first: progress survives reloads and no-internet. Safe when storage is blocked.
 * `ready` is false until the saved value is loaded (avoid flashing defaults).
 */
export function useStored<T>(key: string, initial: () => T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue({ ...initial(), ...JSON.parse(raw) });
    } catch {
      /* storage blocked or bad data: start fresh */
    }
    loaded.current = true;
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);

  const reset = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setValue(initial());
  };

  return [value, setValue, { ready, reset }] as const;
}
