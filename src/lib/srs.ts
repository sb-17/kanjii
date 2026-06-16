import type { Vocab } from "../types/vocabType";
import type { PracticeScope } from "../types/settingsType";

export type Srs = NonNullable<Vocab["srs"]>;

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

export function isNew(v: Vocab): boolean {
  return !v.srs;
}

export function isDue(v: Vocab, now: number): boolean {
  return !v.srs || v.srs.due <= now;
}

export function isRecent(v: Vocab, now: number): boolean {
  return v.addedAt != null && v.addedAt >= now - RECENT_DAYS * DAY;
}

// The next SRS state after grading a review. Correct moves up a box, a miss
// drops back to box 0.
export function applyReview(prev: Srs | undefined, correct: boolean, now: number): Srs {
  const box = correct ? Math.min((prev?.box ?? 0) + 1, MAX_BOX) : 0;
  return { box, due: now + BOX_INTERVALS[box], reviewed: now };
}

export function dueCount(list: Vocab[], now: number): number {
  return list.filter((v) => isDue(v, now)).length;
}

// "Practice sooner" key for ordering (overdue/new first).
function dueKey(v: Vocab): number {
  return v.srs ? v.srs.due : (v.addedAt ?? 0);
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
