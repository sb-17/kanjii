// Turning an Anki text export (or any delimited file) into a Deck.
//
// Anki desktop: File → Export → "Notes in Plain Text (.txt)". That writes
// tab-separated fields, optionally preceded by `#key:value` header lines, with
// note content still carrying HTML and [sound:...] references.
//
// Everything here is pure — no DOM, no storage — so it can be tested without a
// browser.

import type { Deck, DeckCard } from "../types/deckType";

// --- Text cleanup -----------------------------------------------------------

// Anki stores fields as HTML. Cards render as plain text here, so tags become
// nothing (a <br> becomes a space) and entities are decoded. `&amp;` is decoded
// last: doing it first would turn "&amp;lt;" into a literal "<".
export function cleanField(raw: string): string {
  return raw
    .replace(/\[sound:[^\]]*\]/g, "")
    .replace(/\[anki:[^\]]*\]/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(div|p|li|tr)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Delimited parsing ------------------------------------------------------

// Anki declares its separator in a header line; everything else we guess. Tab
// wins when present because a comma is ordinary inside an English meaning
// ("stop, halt") while a tab never is.
export function detectSeparator(lines: string[], declared?: string): string {
  if (declared) return declared;
  const sample = lines.slice(0, 20);
  const count = (sep: string) =>
    sample.reduce((n, line) => n + line.split(sep).length - 1, 0);
  if (count("\t") > 0) return "\t";
  if (count(";") > count(",")) return ";";
  return ",";
}

// Anki writes `#separator:tab` (or `#separator:,`), plus other `#key:value`
// lines we ignore. They only count as headers at the top of the file — a `#` can
// legitimately start a note further down.
function readHeaders(lines: string[]): { declared?: string; body: string[] } {
  let i = 0;
  let declared: string | undefined;
  while (i < lines.length && lines[i].startsWith("#")) {
    const match = /^#separator:(.+)$/i.exec(lines[i].trim());
    if (match) {
      const value = match[1].trim().toLowerCase();
      declared =
        value === "tab"
          ? "\t"
          : value === "comma"
            ? ","
            : value === "semicolon"
              ? ";"
              : value;
    }
    i++;
  }
  return { declared, body: lines.slice(i) };
}

// RFC4180-ish: quoted fields may contain the separator, newlines, and "" as a
// literal quote. Written as a character loop rather than a regex because a field
// can legally span lines, so the file can't simply be split on \n first.
export function parseDelimited(text: string): string[][] {
  // Escaped rather than a literal BOM: as a raw character it's invisible in the
  // source and lint rejects it outright.
  const stripped = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const { declared, body } = readHeaders(stripped.split("\n"));
  const sep = detectSeparator(body, declared);
  const source = body.join("\n");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);

  // Drop rows that are entirely empty (trailing newline, blank lines).
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

// --- Column detection -------------------------------------------------------

const KANA = /[぀-ヿ]/;
const KANJI = /[一-鿿㐀-䶿]/;

function ratio(values: string[], re: RegExp): number {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return 0;
  return nonEmpty.filter((v) => re.test(v)).length / nonEmpty.length;
}

function avgLength(values: string[]): number {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return 0;
  return nonEmpty.reduce((n, v) => n + v.length, 0) / nonEmpty.length;
}

// The five fields kept from an import. Everything else in the file is discarded.
export type ColumnMap = {
  word: number | null;
  reading: number | null;
  meaning: number | null;
  example: number | null;
  exampleEn: number | null;
};

export const COLUMN_KEYS: (keyof ColumnMap)[] = [
  "word",
  "reading",
  "meaning",
  "example",
  "exampleEn",
];

// Guess which column is which so the common case needs no fiddling. The user can
// override every choice in the import form; this only sets the initial values.
//
// Script tells Japanese columns from English ones; *length* then separates a term
// from a sentence. An Anki note's word field is a handful of characters and its
// example sentence is a clause, so the shortest Japanese column is the word and
// the longest is the example — same on the English side for meaning vs
// translation. Reading is the giveaway case: kana with essentially no kanji.
export function detectColumns(rows: string[][]): ColumnMap {
  const width = Math.max(...rows.map((r) => r.length));
  const columns: string[][] = [];
  for (let c = 0; c < width; c++) columns.push(rows.map((r) => r[c] ?? ""));

  const kanji = columns.map((col) => ratio(col, KANJI));
  const kana = columns.map((col) => ratio(col, KANA));
  const length = columns.map(avgLength);
  const indices = Array.from({ length: width }, (_, c) => c);

  const isJapanese = (c: number) => kanji[c] > 0.3 || kana[c] > 0.5;
  const byLength = (a: number, b: number) => length[a] - length[b];

  // Anki exports are full of columns that are neither Japanese nor prose:
  // frequency ranks, note ids, media filenames. Left in, the shortest of them
  // gets picked as the meaning — a numeric rank column beats "water" on length
  // every time. Require actual words.
  const looksLikeText = (col: string[]) => {
    const nonEmpty = col.filter((v) => v.trim() !== "");
    if (nonEmpty.length === 0) return false;
    const texty = nonEmpty.filter(
      (v) =>
        /[a-z]/i.test(v) &&
        !/^\d+(\.\d+)?$/.test(v.trim()) &&
        !/\.(mp3|ogg|wav|m4a|jpe?g|png|gif|webp|svg)$/i.test(v.trim()),
    );
    return texty.length > nonEmpty.length / 2;
  };

  const japaneseCols = indices.filter(isJapanese).sort(byLength);
  const otherAll = indices.filter((c) => !isJapanese(c)).sort(byLength);
  const textual = otherAll.filter((c) => looksLikeText(columns[c]));
  // Fall back to everything if nothing looks like prose, so a file we can't read
  // still imports rather than coming in empty.
  const otherCols = textual.length > 0 ? textual : otherAll;

  // A reading column is kana and almost never kanji. Take the shortest such
  // column so an all-kana *example* sentence can't be mistaken for one.
  const readingCandidates = japaneseCols.filter(
    (c) => kana[c] > 0.5 && kanji[c] < 0.2,
  );
  const reading: number | null =
    readingCandidates.length > 0 && japaneseCols.length > 1
      ? readingCandidates[0]
      : null;

  const restJapanese = japaneseCols.filter((c) => c !== reading);
  let word: number | null = restJapanese[0] ?? null;
  // Only call the longest column an example when it's clearly a sentence rather
  // than a second short field, or a deck with two term-like columns would get a
  // nonsense example. The absolute floor is low because Japanese is compact —
  // 水を飲む。is a whole sentence in five characters, so an English-sized
  // threshold would miss most of them.
  const longestJapanese = restJapanese[restJapanese.length - 1] ?? null;
  const example: number | null =
    longestJapanese !== null &&
    longestJapanese !== word &&
    length[longestJapanese] > 2 * length[word ?? longestJapanese] &&
    length[longestJapanese] >= 4
      ? longestJapanese
      : null;

  let meaning: number | null = otherCols[0] ?? null;
  const longestOther = otherCols[otherCols.length - 1] ?? null;
  const exampleEn: number | null =
    longestOther !== null &&
    longestOther !== meaning &&
    length[longestOther] > 2 * length[meaning ?? longestOther] &&
    length[longestOther] >= 12
      ? longestOther
      : null;

  // word and meaning are what a card is made of, so both must end up assigned. A
  // deck that isn't Japanese at all, or that the checks above couldn't read, still
  // has to import as plain two-sided cards — leaving either null means every row
  // is missing a side and the deck comes in empty.
  const firstUnused = (...taken: (number | null)[]) => {
    for (let c = 0; c < width; c++) if (!taken.includes(c)) return c;
    return null;
  };
  meaning ??= firstUnused(word, reading, example, exampleEn);
  word ??= firstUnused(meaning, reading, example, exampleEn);

  return { word, reading, meaning, example, exampleEn };
}

// --- Ids --------------------------------------------------------------------

// FNV-1a, run twice with different offsets to get 64 bits. Card ids have to be
// stable across devices and app versions (progress is backed up, deck content is
// not), which rules out anything random or ordinal. 64 bits keeps collisions
// negligible for decks far larger than anyone will import.
function fnv(input: string, seed: number): string {
  let hash = seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// Keyed on word + meaning only. The example sentences are deliberately excluded:
// a deck author fixing a sentence in an updated export must not orphan the review
// history of a card whose word and meaning are unchanged.
//
// The separator keeps field boundaries meaningful: without one, ("ab","c") and
// ("a","bc") would hash identically. Written as an escape rather than a raw
// control character, which is invisible in the source and easy to delete by
// accident.
export function cardId(word: string, meaning: string): string {
  const key = `${word}\u001f${meaning}`;
  return fnv(key, 0x811c9dc5) + fnv(key, 0x9e3779b9);
}

// A deck's id is derived from its name for the same reason: import the same deck
// under the same name on your other device and the backed-up progress lines up.
// Names that are entirely non-ASCII (a Japanese deck name) slug to nothing, so
// they fall back to a hash of the name itself.
export function deckId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `deck-${fnv(name, 0x811c9dc5)}`;
}

// --- Building ---------------------------------------------------------------

export type ImportPreview = {
  rows: string[][];
  columns: ColumnMap;
};

export function previewImport(text: string): ImportPreview {
  const rows = parseDelimited(text);
  if (rows.length === 0) throw new Error("That file has no rows in it.");
  return { rows, columns: detectColumns(rows) };
}

// Assemble the deck, keeping only the five mapped fields — every other column in
// the file is dropped here and never stored. Cards missing a word or a meaning
// are skipped rather than imported half-blank, and duplicates collapse to one:
// Anki decks routinely contain the same note twice.
export function buildDeck(
  name: string,
  rows: string[][],
  columns: ColumnMap,
  now: number,
): Deck {
  const pick = (row: string[], index: number | null) =>
    index === null ? "" : cleanField(row[index] ?? "");

  const seen = new Set<string>();
  const cards: DeckCard[] = [];

  for (const row of rows) {
    const word = pick(row, columns.word);
    const meaning = pick(row, columns.meaning);
    if (!word || !meaning) continue;

    const id = cardId(word, meaning);
    if (seen.has(id)) continue;
    seen.add(id);

    const card: DeckCard = { id, word, meaning };
    const reading = pick(row, columns.reading);
    const example = pick(row, columns.example);
    const exampleEn = pick(row, columns.exampleEn);
    if (reading) card.reading = reading;
    if (example) card.example = example;
    if (exampleEn) card.exampleEn = exampleEn;
    cards.push(card);
  }

  if (cards.length === 0) {
    throw new Error(
      "No usable cards — every row was missing a word or a meaning. Check the column choices.",
    );
  }

  // Judged from the cards themselves, not from whether a column was assigned:
  // detectColumns falls back to "the leftover column is the word" for files it
  // can't read, and trusting that would let a non-Japanese deck offer "Add to My
  // Words" and write nonsense into the word list.
  const withJapanese = cards.filter(
    (c) => KANJI.test(c.word) || KANA.test(c.word),
  ).length;

  return {
    id: deckId(name),
    name,
    addedAt: now,
    japanese: withJapanese > cards.length / 2,
    cards,
  };
}
