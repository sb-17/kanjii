import type { Vocab, VocabSrs, SrsBox } from "../types/vocabType";
import type { KanjiProgress } from "../types/kanjiProgress";
import { isKnownOrLearning } from "../storage/kanjiProgress";

function isSrsBox(x: unknown): x is SrsBox {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.box === "number" &&
    typeof s.due === "number" &&
    typeof s.reviewed === "number"
  );
}

// Normalise any stored/imported srs into the per-direction shape. Legacy data
// held one box for the word; seed *both* directions from it so no review progress
// is lost on upgrade — they diverge from the next review on. Malformed → dropped.
export function normalizeVocabSrs(srs: unknown): VocabSrs | undefined {
  if (!srs || typeof srs !== "object") return undefined;
  const s = srs as Record<string, unknown>;
  if (isSrsBox(s)) return { etj: { ...s }, jte: { ...s } };
  const out: VocabSrs = {};
  if (isSrsBox(s.etj)) out.etj = { ...s.etj };
  if (isSrsBox(s.jte)) out.jte = { ...s.jte };
  return out.etj || out.jte ? out : undefined;
}

// Normalise every word's srs (run once at load, to migrate legacy data).
export function normalizeVocabList(list: Vocab[]): Vocab[] {
  return list.map((v) =>
    v.srs ? { ...v, srs: normalizeVocabSrs(v.srs) } : v,
  );
}

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
    const context =
      typeof r.context === "string" && r.context.trim() ? r.context.trim() : undefined;
    const importedAddedAt = typeof r.addedAt === "number" ? r.addedAt : undefined;
    const importedSrs = normalizeVocabSrs(r.srs);

    const key = `${word}|${reading}`;
    const existing = map.get(key);
    if (!existing) added++;
    map.set(key, {
      word,
      reading,
      meanings,
      kanji,
      // keep an existing context unless the import provides one
      context: context ?? existing?.context,
      // keep the original add time; fall back to the imported one
      addedAt: existing?.addedAt ?? importedAddedAt,
      // keep existing review progress; otherwise take the imported state
      srs: existing?.srs ?? importedSrs,
    });
  }

  return { merged: [...map.values()], added };
}
