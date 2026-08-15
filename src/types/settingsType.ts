import type { DeckScope } from "./deckType";

export type WriteMode = "screen" | "paper";

// "due" is a skill-SRS filter, not a status one: learning/known kanji whose
// handwriting review has come due (unwritten kanji count as due).
export type WritePool = "due" | "both" | "learning" | "known";

export type PracticeScope = "smart" | "recent" | "all" | "new";

export type Settings = {
  writeMode: WriteMode;
  guide: boolean;
  writePool: WritePool;
  practiceScope: PracticeScope;
  // Practice: convert romaji to kana as you type, so English → Japanese answers
  // don't need the phone's IME. Off = type Japanese with a real IME.
  romajiInput: boolean;
  // When true, a word is practiceable once *most* (≥50%) of its kanji are
  // Learning/Known, instead of requiring all of them. Off = strict (all kanji).
  partialAvailability: boolean;
  // How many never-practised words the Due scope may introduce per day. Reviews
  // are never capped — this only paces how fast a backlog (a big import) is fed
  // in, so it can't bury the reviews. 0 = never introduce new words.
  newPerDay: number;
  // How imported-deck cards are chosen. Shared across decks rather than stored
  // per deck — it's a study preference, not a property of any one deck.
  deckScope: DeckScope;
};
