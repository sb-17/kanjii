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

// A study day starts at 04:00, not midnight, so a late-night session counts as
// the day it felt like rather than tipping into the next one.
const DAY_CUTOFF_HOUR = 4;

// The start of the study day containing `t`. The single definition of "a day" in
// the app — scheduling, the daily new-word allowance and the per-day charts all
// go through this, so a 01:00 session can't be yesterday to one of them and today
// to another.
export function startOfStudyDay(t: number): number {
  const d = new Date(t);
  if (d.getHours() < DAY_CUTOFF_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(DAY_CUTOFF_HOUR, 0, 0, 0);
  return d.getTime();
}

// The start of the study *week* containing `t`: Monday at the same 04:00 cutoff.
//
// Chart weeks are calendar weeks, not a rolling 7-day window anchored to now. A
// rolling window silently rewrites history: every bar shifts as the day passes,
// so a bar labelled "3 weeks ago" covers different days each time you look at it,
// and finishing a kanji can change a bar from a month back. Anchoring to Monday
// means a week keeps the same contents forever once it has passed.
export function startOfStudyWeek(t: number): number {
  const d = new Date(startOfStudyDay(t));
  // getDay(): 0 = Sunday, so this is days elapsed since the most recent Monday.
  const sinceMonday = (d.getDay() + 6) % 7;
  // setDate rather than subtracting milliseconds, so DST and month ends stay right.
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

// The start of the study *month* and *year* containing `t`, on the same 04:00
// cutoff and for the same reason as the week: calendar boundaries, never a
// rolling 30 or 365 days. A rolling month re-dates every bar daily, so "two
// months ago" would cover different days each time it's looked at.
//
// Both go through startOfStudyDay first, so 01:00 on the 1st belongs to the month
// that was still running when you sat down.
export function startOfStudyMonth(t: number): number {
  const d = new Date(startOfStudyDay(t));
  d.setDate(1);
  return d.getTime();
}

export function startOfStudyYear(t: number): number {
  const d = new Date(startOfStudyDay(t));
  d.setMonth(0, 1);
  return d.getTime();
}

// When something reviewed at `now` should next come up.
//
// Day-length intervals land on the *start of a day*, not on the clock time you
// happened to review at. Anchoring to the moment made the schedule chase your
// habits: clear the queue at 23:00 and everything returns at 23:00 the next day,
// so checking in the morning shows nothing due — you're permanently 14 hours
// early, and the queue only ever opens at the hour you last studied.
//
// Box 0 is deliberately exempt. It's the "come back this session" step, and ten
// minutes means ten minutes.
export function dueAfter(box: number, now: number): number {
  const interval = BOX_INTERVALS[Math.min(Math.max(box, 0), MAX_BOX)];
  if (interval < DAY) return now + interval;

  const d = new Date(startOfStudyDay(now));
  // setDate rather than adding milliseconds, so DST and month ends stay right.
  d.setDate(d.getDate() + Math.round(interval / DAY));
  return d.getTime();
}

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

// A player that only ever tests one direction has to scope by that direction.
// Cards is E→J: it shows the meaning and you recall the Japanese, and it grades
// only `etj`. Judged by the both-directions rules above, such a word is due
// forever — `jte` never gets a box, an unpractised direction always counts as
// due, and `reviewDueKey` pins it at `now`. A word graded to box 5 came straight
// back, which is what made the Cards queue cycle the same handful of words.
//
// Practice alternates via `pickDirection`, so it passes no direction and keeps
// the both-directions semantics: a word isn't finished until both sides are strong.
export function isNewFor(v: Vocab, dir?: ReviewDirection): boolean {
  return dir ? !v.srs?.[dir] : isNew(v);
}

export function isDueFor(v: Vocab, now: number, dir?: ReviewDirection): boolean {
  return dir ? isDirDue(v, dir, now) : isDue(v, now);
}

export function isRecent(v: Vocab, now: number): boolean {
  return v.addedAt != null && v.addedAt >= now - RECENT_DAYS * DAY;
}

// The next box state after grading a review. Correct moves up a box, a miss drops
// back to box 0. Atomic — callers decide which direction it belongs to.
export function applyReview(prev: Srs | undefined, correct: boolean, now: number): Srs {
  const box = correct ? Math.min((prev?.box ?? 0) + 1, MAX_BOX) : 0;
  return { box, due: dueAfter(box, now), reviewed: now };
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
function reviewDueKey(v: Vocab, now: number, dir?: ReviewDirection): number {
  const keyOf = (d: ReviewDirection) => {
    const s = v.srs?.[d];
    return s ? s.due : now;
  };
  return dir ? keyOf(dir) : Math.min(keyOf("etj"), keyOf("jte"));
}

const addedDay = (v: Vocab) => Math.floor((v.addedAt ?? 0) / DAY);

// The never-practised words allowed into today's pool, newest-added first and
// capped by the caller's remaining allowance.
//
// That cap is the whole safety mechanism: new words are mixed *through* the
// review queue below, so an uncapped budget would let a 2,000-word import crowd
// out the reviews — the exact failure this scope was built to avoid. Callers pass
// `newWordsIntroducedToday`-derived budgets; don't rely on the infinite default.
function freshForPool(
  list: Vocab[],
  newBudget: number,
  dir?: ReviewDirection,
): Vocab[] {
  if (newBudget <= 0) return [];
  const fresh = list.filter((v) => isNewFor(v, dir));
  if (fresh.length <= newBudget) return fresh;
  return [...fresh]
    .sort((a, b) => addedDay(b) - addedDay(a))
    .slice(0, newBudget);
}

// The most overdue review, with a little randomness among the front runners so
// the order isn't identical every session. Null when there are no reviews.
function pickMostOverdue(
  reviews: Vocab[],
  now: number,
  dir?: ReviewDirection,
): Vocab | null {
  const started = reviews.filter((v) => !isNewFor(v, dir));
  if (started.length === 0) return null;
  const sorted = [...started].sort(
    (a, b) => reviewDueKey(a, now, dir) - reviewDueKey(b, now, dir),
  );
  const topK = sorted.slice(0, Math.min(5, sorted.length));
  return topK[Math.floor(Math.random() * topK.length)];
}

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
  dir?: ReviewDirection,
): Vocab[] {
  switch (scope) {
    case "smart": {
      // Due reviews and today's allowance of new words go into the pool together;
      // `pickWord` interleaves them. Serving every review first meant a backlog
      // hid new words for an entire session — 500 answers before the first one.
      const reviews = list.filter((v) => !isNewFor(v, dir) && isDueFor(v, now, dir));
      const fresh = freshForPool(list, newBudget, dir);
      if (reviews.length > 0 || fresh.length > 0) return [...reviews, ...fresh];
      // Nothing due and no allowance left: extra practice over words you've
      // actually started. New words are excluded here so the daily allowance
      // can't be sidestepped by simply clearing the queue.
      const started = list.filter((v) => !isNewFor(v, dir));
      return started.length > 0 ? started : list;
    }
    case "recent":
      return list.filter((v) => isRecent(v, now));
    case "new":
      return list.filter((v) => isNewFor(v, dir));
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
  dir?: ReviewDirection,
): Vocab | null {
  if (pool.length === 0) return null;

  let candidates = pool;
  if (pool.length > 1 && exceptKey) {
    const filtered = pool.filter((v) => `${v.word}|${v.reading}` !== exceptKey);
    if (filtered.length > 0) candidates = filtered;
  }

  if (scope === "smart") {
    // A new word in the pool has already passed the pacing gate — the caller only
    // admits one once `NEW_WORD_EVERY_REVIEWS` reviews have been answered since
    // the last one (see analytics `newWordAllowance`). So serve it now rather
    // than rolling dice: the decision was made upstream, where it can be counted
    // against the event log instead of guessed from queue sizes.
    const fresh = candidates.filter((v) => isNewFor(v, dir));
    if (fresh.length > 0) return pickNewWord(fresh);
    return pickMostOverdue(candidates, now, dir);
  }

  if (scope === "recent") {
    const reviews = candidates.filter((v) => !isNewFor(v, dir));
    if (reviews.length > 0) return pickMostOverdue(reviews, now, dir);
    return pickNewWord(candidates);
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}
