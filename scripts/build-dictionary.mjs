// Build-time trim of JMdict into the word list the text reader looks words up in.
//
// The output (src/data/dictionary.json) is derived from JMdict, a project of the
// Electronic Dictionary Research and Development Group (https://www.edrdg.org/),
// distributed under the Creative Commons Attribution-Share Alike 4.0 licence
// (https://creativecommons.org/licenses/by-sa/4.0/). Being built upon that work,
// dictionary.json is shared under the same licence — see README.md.
//
// Full JMdict is 218k entries / 60 MB of XML, and shipping it whole would be
// 5.2 MB gzipped. Two trims bring that to ~424 KB:
//
//   1. Common entries only — those carrying a news1/ichi1/spec1/spec2/gai1
//      priority marker. Everything else is rare, archaic or specialist.
//   2. Entries with a kanji spelling only. Kana-only words are overwhelmingly
//      grammar (する, これ, から) rather than vocabulary worth studying, and this
//      list exists to find words worth *adding*.
//
// Meanings take the first gloss of up to three *senses*, not three glosses of one
// sense. Glosses inside a sense are near-synonyms ("study; learning") and add
// nothing; separate senses are the actual nuances ("spirit; nature; intention").
// Measured: three senses costs 89 KB gzipped over one gloss and is worth it.
//
// Output shape, keyed by the kanji spelling:
//   { "図書館": ["としょかん", ["library"]] }
//
// Re-run only when refreshing from EDRDG:  npm run build:dict

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// Cached under node_modules so it's gitignored already — the source is 60 MB and
// has no business in the repo, but re-downloading it on every run is rude to
// EDRDG's server.
const SRC = "http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz";
const cacheDir = resolve(root, "node_modules/.cache/kanjii");
const cached = resolve(cacheDir, "JMdict_e.gz");

async function source() {
  if (existsSync(cached)) {
    console.log(`Using cached ${cached}`);
    return gunzipSync(readFileSync(cached)).toString("utf8");
  }
  console.log(`Downloading ${SRC} …`);
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const gz = Buffer.from(await res.arrayBuffer());
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cached, gz);
  console.log(`  cached ${(gz.length / 1048576).toFixed(1)} MB`);
  return gunzipSync(gz).toString("utf8");
}

const COMMON = /<(?:ke|re)_pri>(?:news1|ichi1|spec1|spec2|gai1)<\/(?:ke|re)_pri>/;
const PRI = /<(?:ke|re)_pri>/g;

// JMdict's XML uses the five predefined entities plus &-delimited POS codes; the
// latter live in <pos> which we don't read. Decoding &amp; last is what stops
// "&amp;lt;" double-decoding into a tag.
const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const xml = await source();

const dict = {};
const score = {}; // priority-marker count, used only to settle collisions
let entries = 0;
let skippedRare = 0;
let skippedKana = 0;
let collisions = 0;

for (const chunk of xml.split("</entry>")) {
  if (!chunk.includes("<ent_seq>")) continue;
  entries++;

  if (!COMMON.test(chunk)) {
    skippedRare++;
    continue;
  }
  const kebs = [...chunk.matchAll(/<keb>(.*?)<\/keb>/g)].map((m) => m[1]);
  if (!kebs.length) {
    skippedKana++;
    continue;
  }
  const reb = chunk.match(/<reb>(.*?)<\/reb>/)?.[1];
  if (!reb) continue;

  const senses = [];
  for (const s of chunk.split("<sense>").slice(1)) {
    // Plain <gloss> only. g_type="expl"/"lit"/"fig" are explanatory asides, and
    // they are long — an explanation is not a headword meaning.
    const g = s.match(/<gloss>(.*?)<\/gloss>/);
    if (g) senses.push(decode(g[1]));
  }
  if (!senses.length) continue;

  // An array, not a joined string. Glosses contain "; " themselves — 開館 is
  // "opening (for that day's business; of a library, museum, cinema, etc.)" — so
  // anything that joins here forces the consumer to split on an ambiguous
  // separator, and Vocab.meanings would end up holding fragments of one sense.
  const meanings = senses.slice(0, 3);
  const rank = (chunk.match(PRI) ?? []).length;

  for (const keb of kebs) {
    // ~400 surfaces are spelled the same with different readings (開く = ひらく
    // and あく). Keep the commoner one rather than whichever parsed first.
    if (keb in dict) {
      collisions++;
      if (rank <= score[keb]) continue;
    }
    dict[keb] = [reb, meanings];
    score[keb] = rank;
  }
}

const json = JSON.stringify(dict);
const outPath = resolve(root, "src/data/dictionary.json");
writeFileSync(outPath, json);

const raw = Buffer.byteLength(json);
const gz = gzipSync(json, { level: 9 }).length;
const longest = Object.keys(dict).reduce((n, w) => Math.max(n, w.length), 0);

console.log(`Wrote ${outPath}`);
console.log(
  `  ${entries} JMdict entries | ${skippedRare} not common | ${skippedKana} kana-only | ${collisions} same-spelling`,
);
console.log(`  ${Object.keys(dict).length} words | longest ${longest} chars`);
console.log(`  size: ${(raw / 1024).toFixed(0)} KB raw, ${(gz / 1024).toFixed(0)} KB gzipped`);
