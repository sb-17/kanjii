// Imported deck *content* (the cards themselves).
//
// Deliberately NOT part of the backup: a large Anki deck is megabytes, and every
// Drive sync would carry it. Only review progress is backed up (see
// storage/deckProgress.ts), and it reattaches by content-derived card id when the
// same deck file is imported again on the other device.

import type { Deck } from "../types/deckType";
import { readWithMigration, writeValue } from "./db";

const STORAGE_KEY = "kanjii:decks";

// In-memory source of truth, hydrated once at startup (see hydrateDecks).
let cache: Deck[] = [];

export async function hydrateDecks(): Promise<void> {
  cache = (await readWithMigration<Deck[]>(STORAGE_KEY)) ?? [];
}

export function loadDecks(): Deck[] {
  return cache;
}

export function saveDecks(decks: Deck[]): void {
  cache = decks;
  void writeValue(STORAGE_KEY, decks);
}

export function getDeck(id: string): Deck | undefined {
  return cache.find((d) => d.id === id);
}
