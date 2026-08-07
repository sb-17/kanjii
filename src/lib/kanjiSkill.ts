// Grading and scheduling for handwriting skill. Reuses the vocab Leitner engine
// (lib/srs.ts) keyed by character instead of by word.
//
// Design: on screen, skill only rises or holds — never demotes. Screen writing has
// no true fail state (you complete a kanji eventually, or leave and nothing is
// logged), so there's no clean signal to demote on. Decay is the due date's job:
// don't write a kanji for its interval and it resurfaces. Guided tracing never
// advances the box, so the level always means "written from memory".
//
// Paper mode is the exception, and only because it has the signal screen mode
// lacks: the learner says outright whether they got it (`demoteSkill`). The rule
// above was never about writing being un-failable in principle — it was about not
// being able to *observe* the failure.

import { applyReview, dueAfter, type Srs } from "./srs";
import type { KanjiSkill } from "../types/kanjiSkill";

// What a completed write attempt did to the skill box.
//   promote  — clean, from memory: level up
//   hold     — from memory but with help: stay, reschedule at the same level
//   practice — guided tracing: no change at all
export type WriteOutcome = "promote" | "hold" | "practice";

export type WriteQuality = {
  guide: boolean;
  strokes: number;
  misses: number;
  hints: number;
};

// A clean write is unguided, hint-free, with few enough re-tried strokes to be
// slips rather than not-knowing. The tolerance scales with stroke count — one
// stray in a 12-stroke kanji shouldn't read the same as one in a 3-stroke.
export function classifyWrite(q: WriteQuality): WriteOutcome {
  if (q.guide) return "practice";
  const missTolerance = Math.ceil(q.strokes / 3);
  if (q.hints === 0 && q.misses <= missTolerance) return "promote";
  return "hold";
}

// Next skill state after an attempt. `undefined` in and `practice` out means the
// kanji stays untracked — guided tracing alone never creates a skill record.
export function gradeSkill(
  prev: KanjiSkill | undefined,
  outcome: WriteOutcome,
  now: number,
): KanjiSkill | undefined {
  if (outcome === "practice") return prev;
  if (outcome === "promote") return applyReview(prev as Srs | undefined, true, now);

  // hold: keep the box, push the next review out to its interval so a stumbled
  // write leaves the due pool without leveling up. A clean write is required to
  // advance. Same day-anchored scheduling as a promotion — see `dueAfter`.
  const box = prev?.box ?? 0;
  return { box, due: dueAfter(box, now), reviewed: now };
}

// Self-reported failure, paper mode only: back to box 0, so it returns in ~10
// minutes rather than at the interval it had earned. Anything gentler is worse
// than useless at the top of the ladder — a box-5 kanji you couldn't write would
// otherwise be rescheduled a month out on the strength of having failed it.
export function demoteSkill(
  prev: KanjiSkill | undefined,
  now: number,
): KanjiSkill {
  return applyReview(prev as Srs | undefined, false, now);
}

// Never-written kanji count as due, so they surface in the Due scope.
export function isSkillDue(skill: KanjiSkill | undefined, now: number): boolean {
  return !skill || skill.due <= now;
}

// Ordering key for the Due scope: soonest-due first, unwritten (no skill) first
// of all.
export function skillDueKey(skill: KanjiSkill | undefined): number {
  return skill ? skill.due : 0;
}
