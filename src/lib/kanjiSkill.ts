// Grading and scheduling for handwriting skill. Reuses the vocab Leitner engine
// (lib/srs.ts) keyed by character instead of by word.
//
// Design: skill only rises or holds — never demotes. Writing has no true fail
// state (you complete a kanji eventually, or leave and nothing is logged), so
// there's no clean signal to demote on. Decay is the due date's job: don't write
// a kanji for its interval and it resurfaces. Guided tracing never advances the
// box, so the level always means "written from memory".

import { applyReview, BOX_INTERVALS, type Srs } from "./srs";
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
  // advance.
  const box = prev?.box ?? 0;
  return { box, due: now + BOX_INTERVALS[box], reviewed: now };
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
