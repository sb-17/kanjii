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
import { MAX_BOX } from "./srs";
import type { AppEvent } from "../storage/events";

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

export type SrsStats = {
  boxes: number[]; // counts in Leitner boxes 0..MAX_BOX
  unstudied: number; // available words never practiced
  dueToday: number; // available words whose review is due by end of today
  available: number; // words whose kanji are all known/learning
};

function endOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function srsStats(
  vocab: Vocab[],
  progress: KanjiProgress,
  now = Date.now(),
): SrsStats {
  const boxes = new Array(MAX_BOX + 1).fill(0) as number[];
  const cutoff = endOfToday(now);
  let unstudied = 0;
  let dueToday = 0;
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
    // Weakest link: a word is only as strong as its weaker direction, and a
    // never-practised direction counts as box 0 (and due now). So a word tested
    // only one way sits low in the chart until its other side catches up.
    const effBox = Math.min(etj?.box ?? 0, jte?.box ?? 0);
    boxes[Math.min(Math.max(effBox, 0), MAX_BOX)]++;
    if (!etj || etj.due <= cutoff || !jte || jte.due <= cutoff) dueToday++;
  }

  return { boxes, unstudied, dueToday, available };
}

// ---- Handwriting skill (mirrors srsStats, keyed by kanji) ----

export type WritingStats = {
  boxes: number[]; // counts in skill boxes 0..MAX_BOX
  unpracticed: number; // learning/known kanji never written from memory
  practiced: number; // learning/known kanji with a skill record
  dueToday: number; // practiced kanji whose review is due by end of today
};

export function writingStats(
  skill: KanjiSkillMap,
  progress: KanjiProgress,
  now = Date.now(),
): WritingStats {
  const boxes = new Array(MAX_BOX + 1).fill(0) as number[];
  const cutoff = endOfToday(now);
  let unpracticed = 0;
  let practiced = 0;
  let dueToday = 0;

  // Only the writable set — kanji you're actually studying.
  for (const k of KANJI) {
    if (!isKnownOrLearning(progress[k.character])) continue;
    const s = skill[k.character];
    if (s) {
      boxes[Math.min(Math.max(s.box, 0), MAX_BOX)]++;
      practiced++;
      if (s.due <= cutoff) dueToday++;
    } else {
      unpracticed++;
    }
  }

  return { boxes, unpracticed, practiced, dueToday };
}

export type VocabTotals = { total: number; unlocked: number; locked: number };

export function vocabTotals(vocab: Vocab[], progress: KanjiProgress): VocabTotals {
  const unlocked = vocab.filter((v) => isVocabAvailable(v, progress)).length;
  return { total: vocab.length, unlocked, locked: vocab.length - unlocked };
}

export type GrowthBucket = { label: string; count: number };
export type VocabGrowth = { buckets: GrowthBucket[]; older: number; untracked: number };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Words added per week over the last `weeks` weeks (uses the addedAt timestamp).
export function vocabGrowth(
  vocab: Vocab[],
  weeks = 8,
  now = Date.now(),
): VocabGrowth {
  const buckets: GrowthBucket[] = [];
  for (let j = 0; j < weeks; j++) {
    const weeksAgo = weeks - 1 - j;
    buckets.push({ label: weeksAgo === 0 ? "now" : `${weeksAgo}w`, count: 0 });
  }

  let older = 0;
  let untracked = 0;

  for (const v of vocab) {
    if (typeof v.addedAt !== "number") {
      untracked++;
      continue;
    }
    const ageWeeks = Math.floor((now - v.addedAt) / WEEK_MS);
    if (ageWeeks < 0) {
      buckets[weeks - 1].count++; // added "now"/future-dated clock skew
    } else if (ageWeeks < weeks) {
      buckets[weeks - 1 - ageWeeks].count++;
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
    const weeksAgo = weeks - 1 - j;
    buckets.push({ label: weeksAgo === 0 ? "now" : `${weeksAgo}w`, net: 0 });
  }

  let hasData = false;
  for (const e of events) {
    if (e.k !== "kanji") continue;
    const delta = (e.to === "known" ? 1 : 0) - (e.f === "known" ? 1 : 0);
    if (delta === 0) continue;
    const ageWeeks = Math.floor((now - e.t) / WEEK_MS);
    if (ageWeeks < 0) {
      buckets[weeks - 1].net += delta;
      hasData = true;
    } else if (ageWeeks < weeks) {
      buckets[weeks - 1 - ageWeeks].net += delta;
      hasData = true;
    }
  }
  return { buckets, hasData };
}

export type DayCount = { label: string; count: number };
const DAY_MS = 24 * 60 * 60 * 1000;

// Count events of one kind per day over the last `days` days.
function eventsPerDay(
  events: AppEvent[],
  kind: AppEvent["k"],
  days: number,
  now: number,
): { buckets: DayCount[]; total: number } {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const startMs = midnight.getTime() - (days - 1) * DAY_MS;

  const buckets: DayCount[] = [];
  for (let j = 0; j < days; j++) {
    const d = new Date(startMs + j * DAY_MS);
    buckets.push({ label: `${d.getDate()}`, count: 0 });
  }

  let total = 0;
  for (const e of events) {
    if (e.k !== kind || e.t < startMs) continue;
    const d = new Date(e.t);
    d.setHours(0, 0, 0, 0);
    const idx = Math.round((d.getTime() - startMs) / DAY_MS);
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
