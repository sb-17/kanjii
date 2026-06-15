import type { KanjiProgress, KanjiStatus } from "../types/kanjiProgress";
import { readWithMigration, writeValue } from "./db";

const STORAGE_KEY = "kanjii:progress";

// In-memory source of truth, hydrated once at startup (see hydrateProgress).
// Reads stay synchronous for components; writes persist to IndexedDB async.
let cache: KanjiProgress = {};

export async function hydrateProgress(): Promise<void> {
  cache = (await readWithMigration<KanjiProgress>(STORAGE_KEY)) ?? {};
}

export function loadKanjiProgress(): KanjiProgress {
  return cache;
}

export function saveKanjiProgress(progress: KanjiProgress): void {
  cache = progress;
  void writeValue(STORAGE_KEY, progress);
}

export function updateKanjiStatus(
  progress: KanjiProgress,
  kanji: string,
  status: KanjiStatus
): KanjiProgress {
  const next = {
    ...progress,
    [kanji]: status,
  };

  saveKanjiProgress(next);
  return next;
}

export function isKnownOrLearning(status: KanjiStatus | undefined) {
  return status === "known" || status === "learning";
}

export function getStatusCounts(progress: KanjiProgress): Record<KanjiStatus, number> {
  const counts: Record<KanjiStatus, number> = {
    new: 0,
    learning: 0,
    known: 0,
  };

  Object.values(progress).forEach((status) => {
    if (counts[status] !== undefined) {
      counts[status]++;
    }
  });

  return counts;
}
