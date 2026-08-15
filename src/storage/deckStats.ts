// Deck study history, as daily counters rather than per-review events.
//
// Deck study is high-volume by nature — an imported Anki deck is thousands of
// cards — so one event per answer would grow `kanjii:events` (and with it every
// backup and Drive sync) by megabytes a year. One row per deck per day is a few
// dozen bytes and stays bounded forever, while still supporting the per-day
// chart, accuracy and per-deck totals that Analytics actually shows.
//
// This is also why deck reviews are *not* logged as `review` events: that log
// feeds `newWordsIntroducedToday`, which derives the daily new-word allowance
// from the first-ever review of each word. Deck cards landing in it would spend
// the budget meant for the learner's own vocabulary.

import { startOfStudyDay } from "../lib/srs";
import { readWithMigration, writeValue } from "./db";

// Answers given, and how many were correct.
export type DayDeckStat = { n: number; ok: number };
// study-day start (ms, as a string key) → deck id → counts
export type DeckStats = Record<string, Record<string, DayDeckStat>>;

const STORAGE_KEY = "kanjii:deckStats";

// In-memory source of truth, hydrated once at startup (see hydrateDeckStats).
let cache: DeckStats = {};

export async function hydrateDeckStats(): Promise<void> {
  cache = (await readWithMigration<DeckStats>(STORAGE_KEY)) ?? {};
}

export function loadDeckStats(): DeckStats {
  return cache;
}

export function saveDeckStats(stats: DeckStats): void {
  cache = stats;
  void writeValue(STORAGE_KEY, stats);
}

// Bucketed by study day (04:00 cutoff), the app's single definition of "a day",
// so a late-night session counts as the evening it belonged to — matching how
// the event-driven charts bucket.
export function recordDeckReview(
  deckId: string,
  correct: boolean,
  now: number = Date.now(),
): void {
  const day = String(startOfStudyDay(now));
  const forDay = cache[day] ?? {};
  const prev = forDay[deckId] ?? { n: 0, ok: 0 };
  saveDeckStats({
    ...cache,
    [day]: {
      ...forDay,
      [deckId]: { n: prev.n + 1, ok: prev.ok + (correct ? 1 : 0) },
    },
  });
}

// Drop one deck's history when the deck is deleted, alongside its progress, so a
// delete is a genuine clean slate rather than leaving counts attached to an id
// nothing can name any more.
export function clearDeckStats(deckId: string): void {
  const next: DeckStats = {};
  for (const [day, decks] of Object.entries(cache)) {
    const kept = Object.fromEntries(
      Object.entries(decks).filter(([id]) => id !== deckId),
    );
    if (Object.keys(kept).length > 0) next[day] = kept;
  }
  saveDeckStats(next);
}
