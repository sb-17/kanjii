import type { SrsBox } from "./vocabType";

// One card of an imported deck.
//
// `id` is derived from the card's *content*, never generated — see lib/deckImport
// `cardId`. Review progress travels in the backup while deck content deliberately
// doesn't, so the only way progress can reattach after re-importing the same file
// on another device is for the same card to hash to the same id both times.
export type DeckCard = {
  id: string;
  // The prompt side. English by convention, matching the My Words cards.
  front: string;
  // The answer side. Japanese when the import mapped a Japanese column, which is
  // what makes "Add to My Words" possible.
  back: string;
  reading?: string;
};

export type Deck = {
  id: string;
  name: string;
  addedAt: number;
  // Whether `back` holds Japanese. False for a deck imported without a Japanese
  // column — those still study fine, but can't be added to My Words.
  japanese: boolean;
  cards: DeckCard[];
};

// Leitner state per card, keyed by deck then card. Reuses the vocab box shape, so
// lib/srs `applyReview` grades it unchanged.
export type DeckProgress = Record<string, Record<string, SrsBox>>;
