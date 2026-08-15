import type { SrsBox } from "./vocabType";

// One card of an imported deck.
//
// Anki exports carry a column per note field — often a dozen or more (audio,
// furigana markup, frequency ranks, tags). Only these five are kept; everything
// else is dropped at import so the deck stored on the device stays small and the
// card has a fixed, known shape to render.
//
// `id` is derived from the card's *content* at import (word + meaning), never
// generated — see lib/deckImport `cardId`. Review progress travels in the backup
// while deck content deliberately doesn't, so the only way progress can reattach
// after re-importing the same file on another device is for the same card to hash
// to the same id both times.
//
// Editing a card does NOT re-derive the id. Fixing a typo must not detach the
// review history that card has already earned.
export type DeckCard = {
  id: string;
  // Japanese. The answer side, and what "Add to My Words" writes as the word.
  word: string;
  reading?: string;
  // English. The prompt side.
  meaning: string;
  // Example sentence in Japanese, shown with the answer.
  example?: string;
  // Its English translation, shown with the prompt.
  exampleEn?: string;
};

export type Deck = {
  id: string;
  name: string;
  addedAt: number;
  // Whether `word` actually holds Japanese. False for a deck imported without a
  // Japanese column — those still study fine, but can't be added to My Words.
  japanese: boolean;
  cards: DeckCard[];
};

// Leitner state per card, keyed by deck then card. Reuses the vocab box shape, so
// lib/srs `applyReview` grades it unchanged.
export type DeckProgress = Record<string, Record<string, SrsBox>>;

// How the deck player chooses what to show next.
//   due    — reviews that have come round, then never-studied cards (default)
//   new    — never-studied only, in deck order
//   random — anything, shuffled, ignoring the schedule
//   all    — everything, in deck order
export type DeckScope = "due" | "new" | "random" | "all";
