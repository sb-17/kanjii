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

// How overdue a *started* word is — the soonest due date across its directions.
// A direction that's never been tested on an otherwise-started word counts as due
// right now, so it joins today's reviews rather than jumping ahead of genuinely
// overdue ones.
//
// Never-practised words deliberately have no place on this scale. They used to:
// the key fell back to `addedAt`, which put them on the same numeric axis as due
// dates. Since nothing outside Kanjii writes `addedAt`, an imported list all tied
// at 0 and sorted ahead of every real review (and, being tied, stayed in file
// order); meanwhile a word added today keyed on `Date.now()` and sorted behind
// everything. New words are a separate queue now — see `pickNewWord`.
function reviewDueKey(v: Vocab, now: number): number {
  const keyOf = (d: ReviewDirection) => {
    const s = v.srs?.[d];
    return s ? s.due : now;
  };
  return Math.min(keyOf("etj"), keyOf("jte"));
}

const addedDay = (v: Vocab) => Math.floor((v.addedAt ?? 0) / DAY);

// Which never-practised word to introduce next: the most recently added, at
// day granularity. A word you deliberately added today therefore comes before a
// bulk import — and because a whole import shares one day (one timestamp, even),
// the tie is broken at random instead of marching through the file in order.
function pickNewWord(pool: Vocab[]): Vocab {
  const newest = Math.max(...pool.map(addedDay));
  const bucket = pool.filter((v) => addedDay(v) === newest);
  return bucket[Math.floor(Math.random() * bucket.length)];
}

// Narrow the available vocab to the chosen scope.
//   smart  → due reviews, then up to `newBudget` never-practised words
//            (falls back to everything once you're caught up)
//   recent → added in the last RECENT_DAYS
//   new    → never practised
//   all    → everything
//
// `newBudget` is how many brand-new words may still be introduced today; the
// caller derives it from the event log (see analytics.newWordsIntroducedToday).
// Without it a large import is a wall: every unpractised word reports as due, so
// the queue never empties and real reviews never come round.
export function scopeVocab(
  list: Vocab[],
  scope: PracticeScope,
  now: number,
  newBudget = Number.POSITIVE_INFINITY,
): Vocab[] {
  switch (scope) {
    case "smart": {
      // Reviews first — words you've actually studied, coming back on schedule.
      const reviews = list.filter((v) => !isNew(v) && isDue(v, now));
      if (reviews.length > 0) return reviews;
      // Then today's allowance of new words.
      if (newBudget > 0) {
        const fresh = list.filter(isNew);
        if (fresh.length > 0) return fresh;
      }
      // Nothing due and no allowance left: extra practice (the "caught up" case).
      return list;
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

// Pick the next word from a scoped pool. smart/recent take the most overdue
// review (with light randomness among the front runners) and only fall through to
// a new word when the pool holds no reviews; all/new pick at random. Avoids
// repeating the just-shown word when possible.
export function pickWord(
  pool: Vocab[],
  scope: PracticeScope,
  exceptKey?: string,
  now: number = Date.now(),
): Vocab | null {
  if (pool.length === 0) return null;

  let candidates = pool;
  if (pool.length > 1 && exceptKey) {
    const filtered = pool.filter((v) => `${v.word}|${v.reading}` !== exceptKey);
    if (filtered.length > 0) candidates = filtered;
  }

  if (scope === "smart" || scope === "recent") {
    const reviews = candidates.filter((v) => !isNew(v));
    if (reviews.length > 0) {
      const sorted = [...reviews].sort(
        (a, b) => reviewDueKey(a, now) - reviewDueKey(b, now),
      );
      const topK = sorted.slice(0, Math.min(5, sorted.length));
      return topK[Math.floor(Math.random() * topK.length)];
    }
    return pickNewWord(candidates);
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}
