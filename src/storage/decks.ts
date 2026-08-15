// Imported deck *content* (the cards themselves).
//
// Deliberately NOT part of the backup: a large Anki deck is megabytes, and every
// Drive sync would carry it. Only review progress is backed up (see
// storage/deckProgress.ts), and it reattaches by content-derived card id when the
// same deck file is imported again on the other device.

import type { Deck, DeckCard } from "../types/deckType";
import { readWithMigration, writeValue } from "./db";

const STORAGE_KEY = "kanjii:decks";

// In-memory source of truth, hydrated once at startup (see hydrateDecks).
let cache: Deck[] = [];

// The first version of decks stored `{front, back}` per card. Map those onto the
// current field names on load, keeping each card's existing `id` so review
// progress stays attached — re-deriving ids here would silently reset every deck
// imported before the change.
function migrateCard(raw: DeckCard & { front?: string; back?: string }): DeckCard {
  if (raw.word || !raw.back) return raw;
  const card: DeckCard = {
    id: raw.id,
    word: raw.back,
    meaning: raw.front ?? "",
  };
  if (raw.reading) card.reading = raw.reading;
  return card;
}

export async function hydrateDecks(): Promise<void> {
  const stored = (await readWithMigration<Deck[]>(STORAGE_KEY)) ?? [];
  cache = stored.map((deck) => ({ ...deck, cards: deck.cards.map(migrateCard) }));
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

// Replace one deck in place. Used by the deck's own settings and card editor;
// the deck's `id` is derived from its name and must not be recomputed here, or
// editing a card would move the deck and orphan its progress.
export function updateDeck(deck: Deck): void {
  saveDecks(cache.map((d) => (d.id === deck.id ? deck : d)));
}
