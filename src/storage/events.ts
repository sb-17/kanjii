// Append-only activity log for analytics trends (local-first, IndexedDB).
//
// We record raw transitions, not "clicks", so derived charts can use *net* math:
// marking a kanji Known then reverting it nets to zero, and forgetting it later
// shows an honest dip. Nothing here is ever shown as-is — see src/lib/analytics.
//
// Note: we can't backfill history, so trends only cover activity from the moment
// logging was added onward.

import { readWithMigration, writeValue } from "./db";

export type KanjiEvent = {
  t: number; // epoch ms
  k: "kanji";
  c: string; // character
  f: string | null; // previous status (null = untracked)
  to: string; // new status
};

export type ReviewEvent = {
  t: number;
  k: "review";
  w: string; // word
  ok: boolean; // correct?
};

// One completed handwriting attempt. Records how it was completed, not just
// that it was: writing from memory and tracing the template are very different
// evidence, and the difference is what a skill level has to be built on.
export type WriteEvent = {
  t: number;
  k: "write";
  c: string; // character
  n: number; // template stroke count
  m: number; // strokes rejected before completing
  h: number; // hints used
  g: boolean; // guided tracing was on
  ms: number; // first stroke -> completion
};

export type AppEvent = KanjiEvent | ReviewEvent | WriteEvent;

const KEY = "kanjii:events";

let cache: AppEvent[] = [];

export async function hydrateEvents(): Promise<void> {
  cache = (await readWithMigration<AppEvent[]>(KEY)) ?? [];
}

export function loadEvents(): AppEvent[] {
  return cache;
}

// Writes serialize the whole log, so appending per event made every answer cost
// O(log size). Coalesce instead: a burst of events becomes one write, and we
// flush on the way out so nothing in the window is lost.
//
// This bounds write *frequency*, not size — if the log ever gets big enough for
// a single flush to hurt, the fix is bucketing it by day rather than tuning this.
const FLUSH_DELAY = 1000;

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

function flush(): void {
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!dirty) return;
  dirty = false;
  void writeValue(KEY, cache);
}

// Flush on the way out. `pagehide` is the one that reliably fires on mobile
// (backgrounding the PWA never fires `beforeunload`).
export function initEventFlush(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

function append(e: AppEvent): void {
  cache.push(e);
  dirty = true;
  if (flushTimer == null) flushTimer = setTimeout(flush, FLUSH_DELAY);
}

export function logKanjiStatus(char: string, from: string | null, to: string): void {
  if (from === to) return;
  append({ t: Date.now(), k: "kanji", c: char, f: from, to });
}

export function logReview(word: string, correct: boolean): void {
  append({ t: Date.now(), k: "review", w: word, ok: correct });
}

export function logWrite(e: Omit<WriteEvent, "t" | "k">): void {
  append({ t: Date.now(), k: "write", ...e });
}
