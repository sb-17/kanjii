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

// The unique CJK kanji characters in a word (kana/punctuation are ignored).
// Used to auto-fill a user-added word's `kanji` list, which gates whether the
// word appears in cards/practice based on the learner's kanji statuses.
export function extractKanji(word: string): string[] {
  const matches = word.match(/[一-鿿㐀-䶿]/g) ?? [];
  return [...new Set(matches)];
}

// Merge an imported vocab.json-style array into an existing list, de-duping by
// word+reading (later entries win). Missing `kanji` arrays are derived from the
// word. Throws if the input isn't an array.
export function mergeVocab(
  existing: Vocab[],
  raw: unknown,
): { merged: Vocab[]; added: number } {
  if (!Array.isArray(raw)) throw new Error("Expected a JSON array");

  const keyOf = (v: Vocab) => `${v.word}|${v.reading}`;
  const map = new Map<string, Vocab>(existing.map((v) => [keyOf(v), v]));
  let added = 0;

  for (const item of raw as unknown[]) {
    const r = (item ?? {}) as Record<string, unknown>;
    if (typeof r.word !== "string" || !r.word.trim()) continue;

    const word = r.word.trim();
    const reading = typeof r.reading === "string" ? r.reading.trim() : "";
    const meanings = Array.isArray(r.meanings)
      ? (r.meanings as unknown[]).map(String)
      : typeof r.meanings === "string"
        ? r.meanings.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    const kanji =
      Array.isArray(r.kanji) && r.kanji.length
        ? (r.kanji as unknown[]).map(String)
        : extractKanji(word);

    const entry: Vocab = { word, reading, meanings, kanji };
    if (!map.has(keyOf(entry))) added++;
    map.set(keyOf(entry), entry);
  }

  return { merged: [...map.values()], added };
}
