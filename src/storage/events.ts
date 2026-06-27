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

export type AppEvent = KanjiEvent | ReviewEvent;

const KEY = "kanjii:events";

let cache: AppEvent[] = [];

export async function hydrateEvents(): Promise<void> {
  cache = (await readWithMigration<AppEvent[]>(KEY)) ?? [];
}

export function loadEvents(): AppEvent[] {
  return cache;
}

function append(e: AppEvent): void {
  cache.push(e);
  void writeValue(KEY, cache);
}

export function logKanjiStatus(char: string, from: string | null, to: string): void {
  if (from === to) return;
  append({ t: Date.now(), k: "kanji", c: char, f: from, to });
}

export function logReview(word: string, correct: boolean): void {
  append({ t: Date.now(), k: "review", w: word, ok: correct });
}
