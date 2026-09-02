// Turns the user's scheduling settings into the ladders the graders use, and
// re-derives every stored due date when those settings change.
//
// The three modes share a box *shape* but not a pace: handwriting decays faster
// than recognition, and a deck is thousands of cards where the word list is
// hundreds. `settings.practicePace` / `writePace` / `deckPace` scale the base
// ladders; 1 is the intervals below, 0.5 halves every gap and so roughly doubles
// the daily queue.
//
// This module owns the *resolution*, not the grading: `applyReview` still does
// the box arithmetic and takes a ladder from its caller. Nothing here is called
// on a hot path — a ladder is rebuilt per answer, over six numbers.

import { BOX_INTERVALS, dueAfter, type Ladder } from "./srs";
import { loadSettings } from "../storage/settings";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { loadKanjiSkill, saveKanjiSkill } from "../storage/kanjiSkill";
import { loadDeckProgress, saveDeckProgress } from "../storage/deckProgress";
import type { Vocab } from "../types/vocabType";
import type { DeckProgress } from "../types/deckType";
import type { KanjiSkillMap } from "../types/kanjiSkill";

const MINUTE = 60_000;
const DAY = 86_400_000;

// Handwriting's base ladder, tighter at the top than vocab's: a month between
// attempts at a kanji you "know" is a month of losing stroke order.
//
// Same six boxes as BOX_INTERVALS, so `MAX_BOX` still describes the skill-box
// chart in Analytics.
export const SKILL_INTERVALS: number[] = [
  10 * MINUTE, // box 0 (just missed) — comes back this session-ish
  1 * DAY,
  3 * DAY,
  5 * DAY,
  7 * DAY,
  14 * DAY, // box 5 — "mature"
];

// The pace multipliers offered in Settings. Lower = shorter gaps = more due.
export const PACES = [0.5, 0.75, 1, 1.5, 2];

// Scale a ladder, leaving box 0 alone: it's the "come back this session" step,
// and stretching it to a day means a missed item doesn't return in the session
// it was missed in. Day boxes are floored at a day so a low pace can't collapse
// them below the grid `dueAfter` rounds them onto anyway.
export function scaleLadder(base: number[], pace: number): number[] {
  return base.map((ms, i) => (i === 0 ? ms : Math.max(DAY, Math.round(ms * pace))));
}

function ladder(base: number[], pace: number): Ladder {
  return { intervals: scaleLadder(base, pace), miss: loadSettings().missBehaviour };
}

export function vocabLadder(): Ladder {
  return ladder(BOX_INTERVALS, loadSettings().practicePace);
}

export function writeLadder(): Ladder {
  return ladder(SKILL_INTERVALS, loadSettings().writePace);
}

// Decks climb vocab's ladder shape on their own pace multiplier.
export function deckLadder(): Ladder {
  return ladder(BOX_INTERVALS, loadSettings().deckPace);
}

// Re-derive every stored due date from the ladders now in force.
//
// A due date is written at grade time, so without this a pace change would only
// take effect as each item next came round — up to a month of nothing happening
// after moving the slider, which is exactly long enough to conclude the setting
// is broken and move it again.
//
// Lossless, because `reviewed` is stored beside `box`: `due` is a pure function
// of the two and the ladder, so this re-runs that function rather than guessing.
// Anchoring to `reviewed` (not to now) also means it can't quietly postpone work
// that is already overdue.
export function rescheduleAll(): void {
  const vocabIntervals = vocabLadder().intervals;
  const skillIntervals = writeLadder().intervals;
  const deckIntervals = deckLadder().intervals;

  const redue = (intervals: number[]) => (b: { box: number; due: number; reviewed: number }) => ({
    ...b,
    due: dueAfter(b.box, b.reviewed, intervals),
  });

  const reVocab = redue(vocabIntervals);
  saveUserVocab(
    loadUserVocab().map((v): Vocab => {
      const next: Vocab = { ...v };
      if (v.srs?.etj || v.srs?.jte) {
        next.srs = {
          ...(v.srs.etj ? { etj: reVocab(v.srs.etj) } : {}),
          ...(v.srs.jte ? { jte: reVocab(v.srs.jte) } : {}),
        };
      }
      if (v.sentenceSrs) next.sentenceSrs = reVocab(v.sentenceSrs);
      return next;
    }),
  );

  const reSkill = redue(skillIntervals);
  const skill = loadKanjiSkill();
  const nextSkill: KanjiSkillMap = {};
  for (const [char, s] of Object.entries(skill)) nextSkill[char] = reSkill(s);
  saveKanjiSkill(nextSkill);

  const reDeck = redue(deckIntervals);
  const decks = loadDeckProgress();
  const nextDecks: DeckProgress = {};
  for (const [deckId, cards] of Object.entries(decks)) {
    const boxes: DeckProgress[string] = {};
    for (const [cardId, b] of Object.entries(cards)) boxes[cardId] = reDeck(b);
    nextDecks[deckId] = boxes;
  }
  saveDeckProgress(nextDecks);
}
