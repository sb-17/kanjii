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
};
