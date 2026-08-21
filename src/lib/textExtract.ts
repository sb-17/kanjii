// Find dictionary words in a block of Japanese text.
//
// Pure, and deliberately free of any import of dictionary.json: that file is
// ~420 KB and must stay in the lazy chunk with the page that uses it. The caller
// hands the data in, so importing this module costs nothing.
//
// Longest-match from each position, no statistical model. That is enough here
// because the job is "surface words worth adding", not perfect segmentation — a
// missed word costs a glance, and the learner confirms every add. What it is not
// enough for is inflection, which is why deinflect exists alongside it.

import { deinflect } from "./deinflect";
import { extractKanji } from "./vocab";

export type DictionaryData = Record<string, [reading: string, meanings: string[]]>;

export type Dictionary = {
  lookup: (word: string) => [string, string[]] | undefined;
  /** Longest key in the data — the widest window the scanner needs to try. */
  maxWordLength: number;
};

export type FoundWord = {
  /** Dictionary form — what gets added to My Words. */
  word: string;
  reading: string;
  meanings: string[];
  /** How it appeared in the text, when inflected (受けやすい for 受ける). */
  surface: string;
  /** Kanji in the word, for the per-word status chips. */
  kanji: string[];
  /** Times it occurs in the text. */
  count: number;
  /** The sentence the word was first met in — becomes the word's `example`. */
  sentence: string;
};

export function makeDictionary(raw: DictionaryData): Dictionary {
  let maxWordLength = 0;
  for (const key in raw) {
    if (key.length > maxWordLength) maxWordLength = key.length;
  }
  return { lookup: (w) => raw[w], maxWordLength };
}

// Kanji only. The shipped word list has a kanji spelling for every entry (see
// scripts/build-dictionary.mjs), so a window with no kanji cannot match and
// testing for one first skips most of the text cheaply.
const HAS_KANJI = /[\u4e00-\u9fff\u3400-\u4dbf]/;

// Split on sentence-enders, keeping the terminator. A character test rather than
// a lookbehind regex: lookbehind is unsupported on Safari before 16.4, and this
// is a PWA people install on old phones.
const ENDERS = /[。！？!?\n]/;

function sentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (ENDERS.test(text[i])) {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

export function extractWords(text: string, dict: Dictionary): FoundWord[] {
  const found = new Map<string, FoundWord>();
  for (const sentence of sentences(text)) scan(sentence, dict, found);
  return [...found.values()];
}

// Scanning per sentence, not over the whole text, so each word can record where
// it was met and no match can straddle a full stop.
function scan(
  text: string,
  dict: Dictionary,
  found: Map<string, FoundWord>,
): void {
  const { lookup, maxWordLength } = dict;

  let i = 0;
  while (i < text.length) {
    const window = Math.min(maxWordLength, text.length - i);
    let hit: { word: string; entry: [string, string[]]; len: number } | null = null;

    // Longest match wins, and at each length a literal hit beats an inflected
    // one. Both halves matter: scanning every literal length *before* trying any
    // inflection looks equivalent but is not — it lets a short literal beat a
    // long inflected form, so 受けやすい comes back as 受け ("popularity") instead
    // of 受ける, which is the precise error deinflect exists to prevent.
    for (let len = window; len >= 1 && !hit; len--) {
      const sub = text.slice(i, i + len);
      if (!HAS_KANJI.test(sub)) continue;

      const entry = lookup(sub);
      if (entry) {
        hit = { word: sub, entry, len };
        break;
      }

      // Inflections end in kana, so a window ending in kanji cannot be one.
      // Skipping those avoids most of the deinflection work.
      if (len < 2 || HAS_KANJI.test(sub[sub.length - 1])) continue;
      for (const cand of deinflect(sub)) {
        const candEntry = lookup(cand);
        if (candEntry) {
          hit = { word: cand, entry: candEntry, len };
          break;
        }
      }
    }

    if (!hit) {
      i++;
      continue;
    }

    const existing = found.get(hit.word);
    if (existing) existing.count++;
    else
      found.set(hit.word, {
        word: hit.word,
        reading: hit.entry[0],
        meanings: hit.entry[1],
        surface: text.slice(i, i + hit.len),
        kanji: extractKanji(hit.word),
        count: 1,
        sentence: text.trim(),
      });
    i += hit.len;
  }
}
