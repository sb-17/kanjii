// One Leitner review state (box, when next due, when last reviewed). Shared shape
// with the handwriting skill SRS — see lib/srs.ts `Srs`.
export type SrsBox = { box: number; due: number; reviewed: number };

// Practice is bidirectional and the two directions are tracked separately:
// recognition (J→E) and production (E→J) are different skills, and a word isn't
// "known" until both are strong.
export type ReviewDirection = "etj" | "jte";

// Per-direction review state. A direction is absent until first practised.
export type VocabSrs = { etj?: SrsBox; jte?: SrsBox };

export type Vocab = {
  word: string;
  reading: string;
  meanings: string[];
  kanji: string[];
  // Optional, user-added: freeform notes. Your own words about the word.
  context?: string;
  // Optional: a sentence using the word, in Japanese. Distinct from `context`
  // because it isn't a note — it's source material, filled in automatically when
  // a word arrives from a deck card or the text reader, and it is the thing you
  // want to re-read later. Keeping the two apart also means an auto-filled
  // sentence can never overwrite something you wrote yourself.
  example?: string;
  // Optional: epoch ms when the word was first added (used for "recently added").
  addedAt?: number;
  // Optional spaced-repetition state, per direction. Legacy data stored a single
  // box here; it's migrated to both directions on load (see lib/vocab.ts).
  srs?: VocabSrs;
};
