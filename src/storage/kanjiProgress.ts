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

const STATUSES: string[] = ["new", "learning", "known"];

// Validate parsed JSON as a progress map, throwing a user-readable reason if it
// isn't one. Importing *replaces* everything, and the Settings page offers two
// similar-looking JSON imports — so picking the vocab file by mistake must fail
// loudly here rather than silently wipe every kanji status.
export function parseProgress(raw: unknown): KanjiProgress {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Expected an object of kanji → status.");
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error("The file contains no kanji progress.");
  }

  const out: KanjiProgress = {};
  for (const [char, status] of entries) {
    if (typeof status !== "string" || !STATUSES.includes(status)) {
      throw new Error(`"${char}" has an invalid status.`);
    }
    out[char] = status as KanjiStatus;
  }
  return out;
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
