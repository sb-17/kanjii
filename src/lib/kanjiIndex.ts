// A single char→Kanji index over the full dataset, built once at module load.
// Pages and components used to each rebuild their own Map or run a linear .find
// over ~2,136 entries per render; this is the one shared lookup they all reuse.

import kanjiData from "../data/kanji.json";
import type { Kanji } from "../types/kanjiType";

export const ALL_KANJI = kanjiData as Kanji[];

const byChar = new Map(ALL_KANJI.map((k) => [k.character, k]));

export function getKanji(char: string): Kanji | undefined {
  return byChar.get(char);
}

export function hasKanji(char: string): boolean {
  return byChar.has(char);
}
