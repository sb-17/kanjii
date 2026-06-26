// Build-time precompute for the kanji connection map.
//
// Parses every KanjiVG file once and extracts, per kanji in our dataset, its
// component decomposition so the app never has to touch the ~44 MB of SVGs at
// runtime. Output: src/data/kanjiGraph.json, keyed by character:
//   { "持": { "c": ["扌","寺","土","寸"], "p": "寺", "r": "扌" } }
//     c = component elements (deduped, excludes the kanji itself)
//     p = phonetic component (kvg:phon), if any
//     r = radical element (kvg:radical="general"), if any
//
// Re-run after changing kanji.json or the KanjiVG files:  npm run build:graph

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const kanji = JSON.parse(
  readFileSync(resolve(root, "src/data/kanji.json"), "utf8"),
);

const toSvgName = (ch) =>
  ch.codePointAt(0).toString(16).padStart(5, "0") + ".svg";

const graph = {};
let missing = 0;
let withPhon = 0;
let withRad = 0;

for (const k of kanji) {
  const ch = k.character;
  const file = resolve(root, "public/kanjiVG", toSvgName(ch));
  if (!existsSync(file)) {
    missing++;
    graph[ch] = { c: [] };
    continue;
  }

  const svg = readFileSync(file, "utf8");
  const components = new Set();
  let phon = null;
  let radical = null;

  // Each component is a <g> with a kvg:element attribute; the decomposition is
  // nested but a flat scan over all such groups gives us the full component set.
  const groupRe = /<g [^>]*kvg:element="([^"]+)"[^>]*>/g;
  let m;
  while ((m = groupRe.exec(svg))) {
    const tag = m[0];
    const el = m[1];
    if (el !== ch) components.add(el);

    const phonMatch = tag.match(/kvg:phon="([^"]+)"/);
    if (phonMatch) phon = phonMatch[1];

    if (/kvg:radical="general"/.test(tag)) radical = el;
  }

  const entry = { c: [...components] };
  if (phon) {
    entry.p = phon;
    withPhon++;
  }
  if (radical) {
    entry.r = radical;
    withRad++;
  }
  graph[ch] = entry;
}

const outPath = resolve(root, "src/data/kanjiGraph.json");
writeFileSync(outPath, JSON.stringify(graph));

const bytes = readFileSync(outPath).length;
console.log(`Wrote ${outPath}`);
console.log(
  `  ${kanji.length} kanji | ${withPhon} with phonetic | ${withRad} with radical | ${missing} missing SVG`,
);
console.log(`  size: ${(bytes / 1024).toFixed(1)} KB`);
