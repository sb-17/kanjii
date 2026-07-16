// Answer grading for vocab practice.
//
// Deliberately lenient. A graded miss drops the word to Leitner box 0 (see
// src/lib/srs.ts), so a wrong call doesn't just annoy — it corrupts the review
// schedule. "eat" for "to eat" is a recall success and must count as one.

import * as wanakana from "wanakana";

// Leading words that carry no meaning for recall ("to eat" ≡ "eat").
const LEADING = /^(to|a|an|the)\s+/;

// Below this length a single edit can turn one real answer into a different one
// ("up" / "us"), so only fuzzy-match words long enough to be safe.
const FUZZY_MIN_LEN = 4;

export function normalizeMeaning(s: string): string {
  let out = s
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?"'()[\]]/g, "")
    .replace(/\s+/g, " ");

  // Repeat so chains collapse too ("to the store" → "store").
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out.replace(LEADING, "");
  }
  return out;
}

// True if `a` and `b` are within one insert/delete/substitute.
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;

  const sameLength = short.length === long.length;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (sameLength) i++; // substitution
    j++; // insertion into `long`
  }
  return true;
}

// Grade a Japanese → English answer against the word's meanings.
export function meaningMatches(guess: string, meanings: string[]): boolean {
  const g = normalizeMeaning(guess);
  if (!g) return false;

  return meanings.some((m) => {
    const n = normalizeMeaning(m);
    if (!n) return false;
    if (g === n) return true;
    return n.length >= FUZZY_MIN_LEN && withinOneEdit(g, n);
  });
}

// Convert a romaji-as-you-type buffer to kana. IME mode leaves a trailing
// consonant alone ("nihon" → "にほn") so you can keep typing; call `finalizeKana`
// on submit to resolve it.
export function toKanaTyping(raw: string): string {
  return wanakana.toKana(raw, { IMEMode: true });
}

export function finalizeKana(raw: string): string {
  return wanakana.toKana(raw);
}

// Fold kana to a single form for comparison. `convertLongVowelMark: false` keeps
// ー as ー: by default wanakana expands it (コーヒー → こうひい) but leaves it
// alone in hiragana input (こーひー → こーひー), so the two sides would normalize
// differently and never match. Kanji and latin pass through untouched.
const foldKana = (s: string) =>
  wanakana.toHiragana(s, { convertLongVowelMark: false });

// Grade an English → Japanese answer.
//
// Accepts the reading as well as the written form: typing 日本 requires picking
// from an IME candidate list, which tests the IME rather than the learner —
// にほん is what they actually know. Comparison folds kana on both sides so a
// katakana reading typed in hiragana (or vice versa) still counts.
export function japaneseMatches(
  guess: string,
  word: string,
  reading: string,
): boolean {
  const g = guess.trim();
  if (!g) return false;

  const w = word.trim();
  const r = reading.trim();
  if (g === w || (r && g === r)) return true;

  const gk = foldKana(g);
  return gk === foldKana(w) || (!!r && gk === foldKana(r));
}
