import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { KanjiProgress, KanjiStatus } from "../types/kanjiProgress";
import {
  loadKanjiProgress,
  updateKanjiStatus,
  saveKanjiProgress,
} from "../storage/kanjiProgress";

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
    setProgress((prev) => updateKanjiStatus(prev, character, status));
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

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) {
    throw new Error("useProgress must be used within a ProgressProvider");
  }
  return ctx;
}
