import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { KanjiProgress, KanjiStatus } from "../types/kanjiProgress";
import {
  loadKanjiProgress,
  updateKanjiStatus,
  saveKanjiProgress,
} from "../storage/kanjiProgress";
import { logKanjiStatus } from "../storage/events";

type ProgressContextValue = {
  progress: KanjiProgress;
  // Set one kanji's status (persists to storage).
  setStatus: (character: string, status: KanjiStatus) => void;
  // Replace the whole progress map (used by Settings import; persists).
  replaceProgress: (progress: KanjiProgress) => void;
};

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  // Single source of truth for the whole app, hydrated once from storage.
  const [progress, setProgress] = useState<KanjiProgress>(loadKanjiProgress);

  const setStatus = useCallback((character: string, status: KanjiStatus) => {
    // Read the prior status from the cache (always current) before updating, so
    // we log the real transition for analytics — net math handles reverts.
    const prev = loadKanjiProgress()[character] ?? "new";
    if (prev !== status) logKanjiStatus(character, prev, status);
    setProgress((p) => updateKanjiStatus(p, character, status));
  }, []);

  const replaceProgress = useCallback((next: KanjiProgress) => {
    saveKanjiProgress(next);
    setProgress(next);
  }, []);

  return (
    <ProgressContext.Provider value={{ progress, setStatus, replaceProgress }}>
      {children}
    </ProgressContext.Provider>
  );
}

// Exporting a hook beside a component costs this file fast refresh (editing it
// full-reloads instead of hot-swapping). Splitting the hook out would fix that at
// the price of re-pointing 13 imports — not worth it for a file that changes
// about never. Revisit if this file starts moving.
// eslint-disable-next-line react-refresh/only-export-components
export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) {
    throw new Error("useProgress must be used within a ProgressProvider");
  }
  return ctx;
}
