// Pure analytics computations for the stats page. Everything is derived from the
// data we already store (kanji statuses, kanji.json frequency, user vocab + SRS
// state) — no event history, so these are all point-in-time snapshots.

import kanjiData from "../data/kanji.json";
import type { Kanji } from "../types/kanjiType";
import type { KanjiProgress } from "../types/kanjiProgress";
import type { Vocab } from "../types/vocabType";
import type { KanjiSkillMap } from "../types/kanjiSkill";
import { isKnownOrLearning } from "../storage/kanjiProgress";
import { isVocabAvailable } from "./vocab";
import { MAX_BOX, isDue, startOfStudyDay, startOfStudyWeek } from "./srs";
import { isSkillDue } from "./kanjiSkill";
import type { AppEvent } from "../storage/events";
import type { DeckStats, DayDeckStat } from "../storage/deckStats";

const KANJI = kanjiData as Kanji[];
export const TOTAL_KANJI = KANJI.length;

export type StatusBreakdown = {
  known: number;
  learning: number;
  new: number;
  total: number;
};

export function statusBreakdown(progress: KanjiProgress): StatusBreakdown {
  let known = 0;
  let learning = 0;
  for (const k of KANJI) {
    const s = progress[k.character];
    if (s === "known") known++;
    else if (s === "learning") learning++;
  }
  return { known, learning, new: TOTAL_KANJI - known - learning, total: TOTAL_KANJI };
}

export type FreqBand = {
  label: string;
  total: number;
  known: number;
  learning: number;
};

const BAND_TOPS = [500, 1000, 1500, 2000, 2500];

export function frequencyBands(progress: KanjiProgress): FreqBand[] {
  const bands: FreqBand[] = BAND_TOPS.map((hi, i) => ({
    label: `${i === 0 ? 1 : BAND_TOPS[i - 1] + 1}–${hi}`,
    total: 0,
    known: 0,
    learning: 0,
  }));
  const unranked: FreqBand = { label: "Unranked", total: 0, known: 0, learning: 0 };

  for (const k of KANJI) {
    let band: FreqBand;
    if (typeof k.frequency !== "number") {
      band = unranked;
    } else {
      const idx = BAND_TOPS.findIndex((hi) => k.frequency! <= hi);
      band = idx === -1 ? bands[bands.length - 1] : bands[idx];
    }
    band.total++;
    const s = progress[k.character];
    if (s === "known") band.known++;
    else if (s === "learning") band.learning++;
  }

  return [...bands, unranked];
}

// Most common kanji the learner hasn't started yet — the highest-leverage
// "study next" list.
export function mostFrequentNew(progress: KanjiProgress, n = 12): Kanji[] {
  return KANJI.filter(
    (k) => typeof k.frequency === "number" && !isKnownOrLearning(progress[k.character]),
  )
    .sort((a, b) => a.frequency! - b.frequency!)
    .slice(0, n);
}

// How many words were introduced today — a word counts as introduced on the day
// of its first-ever review. Derived from the event log rather than stored, so
// there's no new state to keep in sync (or to get wrong across a restore).
//
// "Today" is the study day (`startOfStudyDay`), the same one scheduling uses. On
// a midnight boundary a 01:00 session would hand out a fresh allowance while the
// SRS still considered it the previous day.
export function newWordsIntroducedToday(
  events: AppEvent[],
  now = Date.now(),
): number {
  const startMs = startOfStudyDay(now);

  const firstSeen = new Map<string, number>();
  for (const e of events) {
    if (e.k !== "review") continue;
    const prev = firstSeen.get(e.w);
    if (prev === undefined || e.t < prev) firstSeen.set(e.w, e.t);
  }

  let n = 0;
  for (const t of firstSeen.values()) if (t >= startMs) n++;
  return n;
}

// Roughly how many reviews should pass between one new word and the next.
//
// A rate, not a proportion. Mixing new words in proportion to the *queue* ties
// the pace to how big your backlog is: with 500 reviews waiting, a 10-a-day
// allowance works out at one new word per 50 answers, so a 100-answer session
// delivers two of them. Pacing by reviews *done* is independent of the backlog
// and is what "one new word every N reviews" actually means. At 20 and a typical
// 100-answer day that works out at 5 new words; `settings.newPerDay` is still the
// ceiling, and only binds past ~200 answers in a day.
export const NEW_WORD_EVERY_REVIEWS = 20;

// Reviews answered so far today.
export function reviewsToday(events: AppEvent[], now = Date.now()): number {
  const startMs = startOfStudyDay(now);
  let n = 0;
  for (const e of events) if (e.k === "review" && e.t >= startMs) n++;
  return n;
}

// How many never-practised words may enter the pool right now: 0 or 1 while
// there are reviews to interleave with, the rest of the day's allowance when
// there are none. `settings.newPerDay` stays the daily ceiling; this only decides
// when within the day each one arrives.
//
// Earned by *counting* today's answers rather than by timing the gap since the
// last introduction. The log records a review, not whether the word was new, so
// "time since the last new word" has to be inferred from first-ever-review
// timestamps — and then reviewing a word whose history predates the log looks
// like an introduction and resets the spacing, which stalled new words entirely.
export function newWordAllowance(
  events: AppEvent[],
  perDay: number,
  hasDueReviews: boolean,
  now = Date.now(),
): number {
  const introduced = newWordsIntroducedToday(events, now);
  const remaining = Math.max(0, perDay - introduced);
  if (remaining === 0) return 0;
  // Caught up on reviews — nothing to pace against, so don't stall the learner.
  if (!hasDueReviews) return remaining;
  const earned = Math.floor(reviewsToday(events, now) / NEW_WORD_EVERY_REVIEWS);
  return earned > introduced ? 1 : 0;
}

// When each kanji entered the status it holds *now*, from the event log.
//
// A kanji can be re-marked (learning → known → back to learning), so the answer
// is the latest transition *into* its current status, not the first one it ever
// had — otherwise a kanji you picked back up last week would sort as months old.
//
// Absent for two groups, which callers must handle rather than treat as epoch 0:
// kanji marked before event logging existed, and kanji from a bare progress-file
// import (`replaceProgress` writes no events). A *full backup* carries the event
// log with it, so restoring one keeps these dates.
export function statusEnteredAt(
  events: AppEvent[],
  progress: KanjiProgress,
): Map<string, number> {
  const at = new Map<string, number>();
  for (const e of events) {
    if (e.k !== "kanji") continue;
    // Only the transitions that led to where the kanji stands today.
    if (e.to !== progress[e.c]) continue;
    const prev = at.get(e.c);
    if (prev === undefined || e.t > prev) at.set(e.c, e.t);
  }
  return at;
}

export type SrsStats = {
  boxes: number[]; // counts in Leitner boxes 0..MAX_BOX
  unstudied: number; // available words never practiced
  due: number; // words Practice's Due scope would offer right now
  available: number; // words whose kanji are all known/learning
};

export function srsStats(
  vocab: Vocab[],
  progress: KanjiProgress,
  now = Date.now(),
  newBudget = Number.POSITIVE_INFINITY,
): SrsStats {
  const boxes = new Array(MAX_BOX + 1).fill(0) as number[];
  let unstudied = 0;
  let due = 0;
  let available = 0;

  // Locked words are excluded throughout: this backs the "Review queue" card, and
  // a word you can't review isn't in the queue. Counting them in the box
  // distribution while leaving them out of the due/unstudied totals made the two
  // halves of the same card disagree.
  for (const v of vocab) {
    if (!isVocabAvailable(v, progress)) continue;
    available++;

    const etj = v.srs?.etj;
    const jte = v.srs?.jte;
    if (!etj && !jte) {
      unstudied++;
      continue;
    }
    // Only *started* words count toward "due" here; the never-practised ones are
    // added below, capped by today's allowance. This card's number and its
    // "Review now →" have to agree with what Practice would actually hand you
    // (`scopeVocab`) — otherwise it reads "2,004 due" against a page that offers
    // a handful.
    if (isDue(v, now)) due++;
    // Weakest link: a word is only as strong as its weaker direction, and a
    // never-practised direction counts as box 0 (and due now). So a word tested
    // only one way sits low in the chart until its other side catches up.
    const effBox = Math.min(etj?.box ?? 0, jte?.box ?? 0);
    boxes[Math.min(Math.max(effBox, 0), MAX_BOX)]++;
  }

  // Plus however many new words Practice may still introduce today.
  due += Math.min(unstudied, Math.max(0, newBudget));

  return { boxes, unstudied, due, available };
}

// ---- Handwriting skill (mirrors srsStats, keyed by kanji) ----

export type WritingStats = {
  boxes: number[]; // counts in skill boxes 0..MAX_BOX
  unpracticed: number; // learning/known kanji never written from memory
  practiced: number; // learning/known kanji with a skill record
  due: number; // kanji the Write page's Due pool would offer right now
};

export function writingStats(
  skill: KanjiSkillMap,
  progress: KanjiProgress,
  now = Date.now(),
): WritingStats {
  const boxes = new Array(MAX_BOX + 1).fill(0) as number[];
  let unpracticed = 0;
  let practiced = 0;
  let due = 0;

  // Only the writable set — kanji you're actually studying.
  for (const k of KANJI) {
    if (!isKnownOrLearning(progress[k.character])) continue;
    const s = skill[k.character];
    if (s) {
      boxes[Math.min(Math.max(s.box, 0), MAX_BOX)]++;
      practiced++;
    } else {
      unpracticed++;
    }
    // Same predicate as the Write page's Due pool (`computePool`), so the two can
    // never disagree — an unwritten kanji counts as due, and one rescheduled for
    // later today does not.
    if (isSkillDue(s, now)) due++;
  }

  return { boxes, unpracticed, practiced, due };
}

export type VocabTotals = { total: number; unlocked: number; locked: number };

export function vocabTotals(vocab: Vocab[], progress: KanjiProgress): VocabTotals {
  const unlocked = vocab.filter((v) => isVocabAvailable(v, progress)).length;
  return { total: vocab.length, unlocked, locked: vocab.length - unlocked };
}

export type GrowthBucket = { label: string; count: number };
export type VocabGrowth = { buckets: GrowthBucket[]; older: number; untracked: number };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// How many whole calendar weeks back `t` falls, counting from the Monday-anchored
// week containing `now`. 0 is the current week.
//
// Rounded, not floored: a week spanning a DST change is 167 or 169 hours long, so
// dividing the raw millisecond gap would land an hour either side of the boundary
// in the wrong bucket twice a year.
function weeksAgo(t: number, now: number): number {
  return Math.round((startOfStudyWeek(now) - startOfStudyWeek(t)) / WEEK_MS);
}

// Bucket labels for the week charts. "this" rather than "now": these are calendar
// weeks, and the current one is a week in progress, not an instant.
function weekLabel(n: number): string {
  return n === 0 ? "this" : `${n}w`;
}

// Words added per week over the last `weeks` weeks (uses the addedAt timestamp).
export function vocabGrowth(
  vocab: Vocab[],
  weeks = 8,
  now = Date.now(),
): VocabGrowth {
  const buckets: GrowthBucket[] = [];
  for (let j = 0; j < weeks; j++) {
    buckets.push({ label: weekLabel(weeks - 1 - j), count: 0 });
  }

  let older = 0;
  let untracked = 0;

  for (const v of vocab) {
    if (typeof v.addedAt !== "number") {
      untracked++;
      continue;
    }
    const age = weeksAgo(v.addedAt, now);
    if (age < 0) {
      buckets[weeks - 1].count++; // future-dated clock skew: count as this week
    } else if (age < weeks) {
      buckets[weeks - 1 - age].count++;
    } else {
      older++;
    }
  }

  return { buckets, older, untracked };
}

// ---- Trends (from the event log) ----

export type SignedWeek = { label: string; net: number };

// Net change in the Known set per week — derived from raw transitions, so a
// revert (Known → Learning) subtracts and shows as a downward bar.
export function knownPerWeek(
  events: AppEvent[],
  weeks = 8,
  now = Date.now(),
): { buckets: SignedWeek[]; hasData: boolean } {
  const buckets: SignedWeek[] = [];
  for (let j = 0; j < weeks; j++) {
    buckets.push({ label: weekLabel(weeks - 1 - j), net: 0 });
  }

  let hasData = false;
  for (const e of events) {
    if (e.k !== "kanji") continue;
    const delta = (e.to === "known" ? 1 : 0) - (e.f === "known" ? 1 : 0);
    if (delta === 0) continue;
    const age = weeksAgo(e.t, now);
    if (age < 0) {
      buckets[weeks - 1].net += delta;
      hasData = true;
    } else if (age < weeks) {
      buckets[weeks - 1 - age].net += delta;
      hasData = true;
    }
  }
  return { buckets, hasData };
}

export type DayCount = { label: string; count: number };
const DAY_MS = 24 * 60 * 60 * 1000;

// Count events of one kind per day over the last `days` days.
//
// Bucketed by study day (`startOfStudyDay`), so a 01:00 session lands in the bar
// for the evening it belongs to rather than splitting one sitting across two.
function eventsPerDay(
  events: AppEvent[],
  kind: AppEvent["k"],
  days: number,
  now: number,
): { buckets: DayCount[]; total: number } {
  const startMs = startOfStudyDay(now) - (days - 1) * DAY_MS;

  const buckets: DayCount[] = [];
  for (let j = 0; j < days; j++) {
    const d = new Date(startMs + j * DAY_MS);
    buckets.push({ label: `${d.getDate()}`, count: 0 });
  }

  let total = 0;
  for (const e of events) {
    if (e.k !== kind || e.t < startMs) continue;
    const idx = Math.round((startOfStudyDay(e.t) - startMs) / DAY_MS);
    if (idx >= 0 && idx < days) {
      buckets[idx].count++;
      total++;
    }
  }
  return { buckets, total };
}

// Practice reviews per day over the last `days` days.
export function reviewsPerDay(events: AppEvent[], days = 14, now = Date.now()) {
  return eventsPerDay(events, "review", days, now);
}

// Handwriting practice completions per day over the last `days` days.
export function writesPerDay(events: AppEvent[], days = 14, now = Date.now()) {
  return eventsPerDay(events, "write", days, now);
}

export type DeckTrend = {
  buckets: DayCount[];
  total: number;
  correct: number;
};

// Deck answers per day, summed across every deck. Built from the daily counters
// (storage/deckStats) rather than the event log — same buckets and same study-day
// cutoff as the charts above, so the bars line up with them.
export function deckReviewsPerDay(
  stats: DeckStats,
  days = 14,
  now = Date.now(),
): DeckTrend {
  const startMs = startOfStudyDay(now) - (days - 1) * DAY_MS;

  const buckets: DayCount[] = [];
  for (let j = 0; j < days; j++) {
    const d = new Date(startMs + j * DAY_MS);
    buckets.push({ label: `${d.getDate()}`, count: 0 });
  }

  let total = 0;
  let correct = 0;
  for (const [day, decks] of Object.entries(stats)) {
    const t = Number(day);
    if (!Number.isFinite(t)) continue;
    const idx = Math.round((t - startMs) / DAY_MS);
    for (const stat of Object.values(decks)) {
      if (idx >= 0 && idx < days) {
        buckets[idx].count += stat.n;
        total += stat.n;
        correct += stat.ok;
      }
    }
  }
  return { buckets, total, correct };
}

// Lifetime answers per deck, for the per-deck breakdown. Covers all of history,
// not just the charted window — the chart answers "how much lately", this
// answers "how much ever".
export function deckTotals(stats: DeckStats): Record<string, DayDeckStat> {
  const out: Record<string, DayDeckStat> = {};
  for (const decks of Object.values(stats)) {
    for (const [id, stat] of Object.entries(decks)) {
      const prev = out[id] ?? { n: 0, ok: 0 };
      out[id] = { n: prev.n + stat.n, ok: prev.ok + stat.ok };
    }
  }
  return out;
}
