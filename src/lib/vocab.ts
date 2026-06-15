import type { Vocab } from "../types/vocabType";
import type { KanjiProgress } from "../types/kanjiProgress";
import { isKnownOrLearning } from "../storage/kanjiProgress";

// A vocab word is "available" for cards/practice when every kanji it uses is
// marked learning or known.
export function isVocabAvailable(vocab: Vocab, progress: KanjiProgress): boolean {
  return vocab.kanji.every((k) => isKnownOrLearning(progress[k]));
}

// Fraction (0..1) of a word's kanji that are known or learning.
export function knownRatio(vocab: Vocab, progress: KanjiProgress): number {
  if (vocab.kanji.length === 0) return 0;
  const count = vocab.kanji.filter((k) => isKnownOrLearning(progress[k])).length;
  return count / vocab.kanji.length;
}
