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
  // Practice: whether example sentences join the queue as fill-in-the-blank
  // items, scheduled on their own box. Only sentences that literally contain the
  // word can be used — see lib/sentenceSrs `clozeSpan`.
  practiceSentences: boolean;
  // When true, a word is practiceable once *most* (≥50%) of its kanji are
  // Learning/Known, instead of requiring all of them. Off = strict (all kanji).
  partialAvailability: boolean;
  // How many never-practised words the Due scope may introduce per day. Reviews
  // are never capped — this only paces how fast a backlog (a big import) is fed
  // in, so it can't bury the reviews. 0 = never introduce new words.
  newPerDay: number;
  // The same cap for handwriting: never-written kanji the Write page's Due pool
  // may add per day. Without it, marking 200 kanji Learning drops all 200 into
  // the pool at once, since an unwritten kanji always counts as due.
  writeNewPerDay: number;
  // Multipliers on the Leitner ladders — 1 = the intervals in lib/schedule, 0.5
  // = half the gaps and so roughly twice the daily queue. Per mode because the
  // three decay at different rates and are studied in different volumes.
  practicePace: number;
  writePace: number;
  deckPace: number;
  // Where a wrong answer sends an item: back to box 0, or back one box.
  missBehaviour: "reset" | "step";
  // Hour a study day begins (0–23). Everything scheduling and every chart bucket
  // is anchored to it, so a late-night session counts as the day it felt like.
  dayCutoffHour: number;
  // Whether the first-run prompt on Home has been answered or dismissed. Lives
  // in settings so it rides along in a backup: restoring onto a second device
  // shouldn't ask again. Shown only while this is false *and* nothing is tagged
  // yet, so existing users never see it.
  onboardingDismissed: boolean;
  // How imported-deck cards are chosen. Shared across decks rather than stored
  // per deck — it's a study preference, not a property of any one deck.
  deckScope: DeckScope;
};
