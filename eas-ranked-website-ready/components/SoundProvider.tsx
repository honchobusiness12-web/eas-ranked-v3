"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { playClick, playHover, playSuccess, playError } from "@/lib/sounds";

interface SoundContextValue {
  enabled: boolean;
  toggle: () => void;
  click: () => void;
  hover: () => void;
  success: () => void;
  error: () => void;
}

const SoundContext = createContext<SoundContextValue>({
  enabled: true,
  toggle: () => {},
  click: () => {},
  hover: () => {},
  success: () => {},
  error: () => {},
});

export function useSounds() {
  return useContext(SoundContext);
}

const STORAGE_KEY = "eas-sounds-enabled";

export default function SoundProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(true);

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      setEnabled(stored === "true");
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const click = useCallback(() => { if (enabled) playClick(); }, [enabled]);
  const hover = useCallback(() => { if (enabled) playHover(); }, [enabled]);
  const success = useCallback(() => { if (enabled) playSuccess(); }, [enabled]);
  const error = useCallback(() => { if (enabled) playError(); }, [enabled]);

  return (
    <SoundContext.Provider value={{ enabled, toggle, click, hover, success, error }}>
      {children}
    </SoundContext.Provider>
  );
}
