import type { KanjiProgress, KanjiStatus } from "../types/kanjiProgress";
import { readWithMigration, writeValue } from "./db";

const STORAGE_KEY = "kanjii:progress";

// In-memory source of truth, hydrated once at startup (see hydrateProgress).
// Reads stay synchronous for components; writes persist to IndexedDB async.
let cache: KanjiProgress = {};

export async function hydrateProgress(): Promise<void> {
  const stored = (await readWithMigration<KanjiProgress>(STORAGE_KEY)) ?? {};
  cache = withoutNew(stored);
}

// "new" is the absence of an entry, never a stored value. Every reader already
// falls back with `progress[ch] ?? "new"`, so an explicit "new" says nothing —
// it's only what tagging a kanji by mistake and reverting it used to leave
// behind, riding along in every backup. Applied on load too, so entries written
// before this was fixed are dropped rather than kept forever.
function withoutNew(progress: KanjiProgress): KanjiProgress {
  const out: KanjiProgress = {};
  for (const [char, status] of Object.entries(progress)) {
    if (status !== "new") out[char] = status;
  }
  return out;
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
  const next = { ...progress };
  if (status === "new") delete next[kanji];
  else next[kanji] = status;

  saveKanjiProgress(next);
  return next;
}

// Started at all. Mastered is included — it's a grade of known, not a separate
// track — so word availability, the Write pools and Learn next treat it as known.
export function isKnownOrLearning(status: KanjiStatus | undefined) {
  return status === "learning" || isAtLeastKnown(status);
}

// Known or Mastered. The test for "is this known?" anywhere that isn't showing
// the tags themselves. Takes a plain string because event-log statuses are
// stored untyped.
export function isAtLeastKnown(status: string | null | undefined): boolean {
  return status === "known" || status === "mastered";
}

const STATUSES: string[] = ["new", "learning", "known", "mastered"];

// Validate parsed JSON as a progress map, throwing a user-readable reason if it
// isn't one. Only reached through parseBackup now, and a restore *replaces*
// everything — so a malformed progress section must fail loudly here rather than
// silently wipe every kanji status.
export function parseProgress(raw: unknown): KanjiProgress {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Expected an object of kanji → status.");
  }

  // An empty map is valid: it's what a backup holds when nothing is tagged, and
  // since "new" is no longer stored it's also what tagging and un-tagging leaves.
  // The emptiness check here dated from the standalone progress import, where an
  // empty file meant the wrong file; inside a backup it made nothing-tagged
  // unrestorable.
  const out: KanjiProgress = {};
  for (const [char, status] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof status !== "string" || !STATUSES.includes(status)) {
      throw new Error(`"${char}" has an invalid status.`);
    }
    // Still accepted from older backups, just not kept.
    if (status !== "new") out[char] = status as KanjiStatus;
  }
  return out;
}
