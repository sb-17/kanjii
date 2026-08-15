// Review progress for imported decks, keyed deck → card → Leitner box.
//
// This *is* in the backup, unlike the deck content it refers to. Restoring onto a
// device that hasn't imported the deck yet leaves the entries orphaned and inert;
// importing the same file later reattaches them, because card ids are derived
// from card content rather than generated per device.

import type { DeckProgress } from "../types/deckType";
import type { SrsBox } from "../types/vocabType";
import { readWithMigration, writeValue } from "./db";

const STORAGE_KEY = "kanjii:deckProgress";

// In-memory source of truth, hydrated once at startup (see hydrateDeckProgress).
let cache: DeckProgress = {};

export async function hydrateDeckProgress(): Promise<void> {
  cache = (await readWithMigration<DeckProgress>(STORAGE_KEY)) ?? {};
}

export function loadDeckProgress(): DeckProgress {
  return cache;
}

export function saveDeckProgress(progress: DeckProgress): void {
  cache = progress;
  void writeValue(STORAGE_KEY, progress);
}

export function deckBoxes(deckId: string): Record<string, SrsBox> {
  return cache[deckId] ?? {};
}

export function setCardBox(deckId: string, cardId: string, box: SrsBox): void {
  saveDeckProgress({
    ...cache,
    [deckId]: { ...(cache[deckId] ?? {}), [cardId]: box },
  });
}

// Drop a deck's progress when the deck itself is deleted, so removing and
// re-importing a deck is a genuine reset rather than picking up stale boxes.
export function clearDeckProgress(deckId: string): void {
  if (!(deckId in cache)) return;
  const next = { ...cache };
  delete next[deckId];
  saveDeckProgress(next);
}
