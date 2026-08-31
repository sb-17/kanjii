// Example sentences as a practice item: the sentence is shown, you translate it
// in your head, and you grade yourself against the translation you wrote. Pure —
// Practice feeds it the caller's `now`.
//
// Self-graded, unlike every other item in Practice, because a typed translation
// cannot be checked. One Japanese sentence has too many correct English
// renderings for a string matcher to judge ("I'm going to school today" / "Today
// I go to school"), and a graded miss drops a Leitner box. So `exampleEn` is the
// reference you compare against, not an answer key — which is also why a sentence
// with no translation is left out entirely: there'd be nothing to reveal.
//
// A sentence keeps its own box (`Vocab.sentenceSrs`) rather than becoming a third
// ReviewDirection, so `isDue` and every count built on it still mean what they
// meant before — see types/vocabType.

import type { Vocab } from "../types/vocabType";
import type { PracticeScope } from "../types/settingsType";
import { isDue, isNew, isRecent, reviewDueKey } from "./srs";

const keyOf = (v: Vocab) => `${v.word}|${v.reading}`;

// A sentence is practisable when it has a translation to reveal *and* its word
// has been practised at least once. The second half keeps an import from arriving
// as a wall of sentences the way it once did as a wall of words: the sentence is
// a deepening step for a word you've started, not a first encounter with it.
export function hasSentence(v: Vocab): boolean {
  return !!v.example && !!v.exampleEn && !isNew(v);
}

export function isSentenceNew(v: Vocab): boolean {
  return !v.sentenceSrs;
}

// Never-practised is *not* due, the same rule words follow: a sentence with no
// box is a separate queue, never an entry pinned to time 0 on the due axis.
export function isSentenceDue(v: Vocab, now: number): boolean {
  const s = v.sentenceSrs;
  return !!s && s.due <= now;
}

// The sentences the scope allows, mirroring `scopeVocab`'s meanings.
export function sentencePool(
  list: Vocab[],
  scope: PracticeScope,
  now: number,
): Vocab[] {
  const ready = list.filter(hasSentence);
  switch (scope) {
    case "smart":
      return ready.filter((v) => isSentenceDue(v, now) || isSentenceNew(v));
    case "recent":
      return ready.filter((v) => isRecent(v, now));
    case "new":
      return ready.filter(isSentenceNew);
    case "all":
    default:
      return ready;
  }
}

// The next sentence from a scoped pool, mirroring `pickWord`: due reviews first
// (most overdue, with light randomness among the front runners), a never-seen
// sentence only when no review is waiting; random scopes draw at random.
//
// No `now` needed, unlike `pickWord`: one box means one due date to sort on,
// where a word has to reduce two directions against the clock first.
export function pickSentence(
  pool: Vocab[],
  scope: PracticeScope,
  exceptKey?: string,
): Vocab | null {
  if (pool.length === 0) return null;

  let candidates = pool;
  if (pool.length > 1 && exceptKey) {
    const filtered = pool.filter((v) => keyOf(v) !== exceptKey);
    if (filtered.length > 0) candidates = filtered;
  }

  const pickRandom = (list: Vocab[]) =>
    list[Math.floor(Math.random() * list.length)];

  if (scope === "smart" || scope === "recent") {
    const reviews = candidates.filter((v) => !isSentenceNew(v));
    if (reviews.length > 0) {
      const sorted = [...reviews].sort(
        (a, b) => (a.sentenceSrs?.due ?? 0) - (b.sentenceSrs?.due ?? 0),
      );
      return pickRandom(sorted.slice(0, Math.min(5, sorted.length)));
    }
    const fresh = candidates.filter(isSentenceNew);
    return fresh.length > 0 ? pickRandom(fresh) : null;
  }
  return pickRandom(candidates);
}

// Serve the sentence instead of the word? The tiers, in order:
//
//   1. a new word today's allowance just admitted — that decision was made
//      upstream against the event log, so it isn't second-guessed here;
//   2. the most overdue review, word and sentence ranked on the same due axis
//      (`reviewDueKey`), so neither queue can bury the other;
//   3. a never-seen sentence — ahead of the caught-up "extra practice" word,
//      which is the only word candidate left once nothing is due.
//
// Random scopes have no due axis, so they draw uniformly over the merged pool;
// that is what the pool sizes are for.
export function preferSentence(
  word: Vocab | null,
  sentence: Vocab | null,
  scope: PracticeScope,
  now: number,
  pools: { words: number; sentences: number },
): boolean {
  if (!sentence) return false;
  if (!word) return true;

  if (scope !== "smart" && scope !== "recent") {
    const total = pools.words + pools.sentences;
    return total > 0 && Math.random() * total >= pools.words;
  }

  if (isNew(word)) return false;
  if (isSentenceNew(sentence)) return !isDue(word, now);
  return (sentence.sentenceSrs?.due ?? 0) < reviewDueKey(word, now);
}
