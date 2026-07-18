import type { Vocab, VocabSrs, ReviewDirection, SrsBox } from "../types/vocabType";
import type { PracticeScope } from "../types/settingsType";

// One atomic Leitner box. Same shape as a per-direction vocab box and the
// handwriting skill (types/kanjiSkill.ts reuses this).
export type Srs = SrsBox;

const MINUTE = 60_000;
const DAY = 86_400_000;

// How long a word in each Leitner box waits before it's due again.
export const BOX_INTERVALS: number[] = [
  10 * MINUTE, // box 0 (just learned / just missed) — comes back this session-ish
  1 * DAY,
  3 * DAY,
  7 * DAY,
  14 * DAY,
  30 * DAY, // box 5 — "mature"
];
export const MAX_BOX = BOX_INTERVALS.length - 1;

// "Recently added" window.
export const RECENT_DAYS = 14;

export const DIRECTIONS: ReviewDirection[] = ["etj", "jte"];

// A direction's box, if it's been practised.
export function dirSrs(v: Vocab, dir: ReviewDirection): Srs | undefined {
  return v.srs?.[dir];
}

// A direction is due when it's never been practised or its timer has elapsed.
export function isDirDue(v: Vocab, dir: ReviewDirection, now: number): boolean {
  const s = v.srs?.[dir];
  return !s || s.due <= now;
}

// A word is new until at least one direction has been practised.
export function isNew(v: Vocab): boolean {
  return !v.srs || (!v.srs.etj && !v.srs.jte);
}

// A word is due if either direction is due — including a direction that has never
// been practised. So a word tested only one way keeps coming back until both
// directions are strong, which is the whole point of tracking them separately.
export function isDue(v: Vocab, now: number): boolean {
  return DIRECTIONS.some((d) => isDirDue(v, d, now));
}

export function isRecent(v: Vocab, now: number): boolean {
  return v.addedAt != null && v.addedAt >= now - RECENT_DAYS * DAY;
}

// The next box state after grading a review. Correct moves up a box, a miss drops
// back to box 0. Atomic — callers decide which direction it belongs to.
export function applyReview(prev: Srs | undefined, correct: boolean, now: number): Srs {
  const box = correct ? Math.min((prev?.box ?? 0) + 1, MAX_BOX) : 0;
  return { box, due: now + BOX_INTERVALS[box], reviewed: now };
}

// Grade one direction of a word, returning the updated per-direction srs. Leaves
// the other direction untouched.
export function gradeDirection(
  v: Vocab,
  dir: ReviewDirection,
  correct: boolean,
  now: number,
): VocabSrs {
  const srs: VocabSrs = { ...(v.srs ?? {}) };
  srs[dir] = applyReview(srs[dir], correct, now);
  return srs;
}

// Which direction to test now: prefer a due one; among the candidates pick the
// weaker box (a never-practised direction is weakest), random on a tie. This is
// what drives both directions toward maturity instead of grinding one.
export function pickDirection(v: Vocab, now: number): ReviewDirection {
  const due = DIRECTIONS.filter((d) => isDirDue(v, d, now));
  const pool = due.length > 0 ? due : DIRECTIONS;
  const boxOf = (d: ReviewDirection) => v.srs?.[d]?.box ?? -1;
  const min = Math.min(...pool.map(boxOf));
  const weakest = pool.filter((d) => boxOf(d) === min);
  return weakest[Math.floor(Math.random() * weakest.length)];
}

export function dueCount(list: Vocab[], now: number): number {
  return list.filter((v) => isDue(v, now)).length;
}

// "Practice sooner" key for ordering (overdue/new first): the soonest actionable
// time across both directions.
function dirDueKey(v: Vocab, dir: ReviewDirection): number {
  const s = v.srs?.[dir];
  return s ? s.due : (v.addedAt ?? 0);
}
function dueKey(v: Vocab): number {
  return Math.min(dirDueKey(v, "etj"), dirDueKey(v, "jte"));
}

// Narrow the available vocab to the chosen scope.
//   smart  → due words (falls back to everything once you're caught up)
//   recent → added in the last RECENT_DAYS
//   new    → never practised
//   all    → everything
export function scopeVocab(
  list: Vocab[],
  scope: PracticeScope,
  now: number,
): Vocab[] {
  switch (scope) {
    case "smart": {
      const due = list.filter((v) => isDue(v, now));
      return due.length > 0 ? due : list;
    }
    case "recent":
      return list.filter((v) => isRecent(v, now));
    case "new":
      return list.filter((v) => isNew(v));
    case "all":
    default:
      return list;
  }
}

// Pick the next word from a scoped pool. smart/recent order by soonest-due (with
// light randomness among the top few); all/new pick at random. Avoids repeating
// the just-shown word when possible.
export function pickWord(
  pool: Vocab[],
  scope: PracticeScope,
  exceptKey?: string,
): Vocab | null {
  if (pool.length === 0) return null;

  let candidates = pool;
  if (pool.length > 1 && exceptKey) {
    const filtered = pool.filter((v) => `${v.word}|${v.reading}` !== exceptKey);
    if (filtered.length > 0) candidates = filtered;
  }

  if (scope === "smart" || scope === "recent") {
    const sorted = [...candidates].sort((a, b) => dueKey(a) - dueKey(b));
    const topK = sorted.slice(0, Math.min(5, sorted.length));
    return topK[Math.floor(Math.random() * topK.length)];
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}
