// Build-time precompute for draw-to-search on the kanji list.
//
// The output (src/data/kanjiStrokeIndex.json) is derived from KanjiVG
// (http://kanjivg.tagaini.net), copyright (C) 2009/2010/2011 Ulrich Apel, which is
// distributed under the Creative Commons Attribution-Share Alike 3.0 licence
// (http://creativecommons.org/licenses/by-sa/3.0/). Being built upon that work,
// kanjiStrokeIndex.json is shared under the same licence — see README.md.
//
// Ranking a drawing means comparing it against *every* kanji, and the stroke data
// is ~44 MB of SVGs fetched on demand — so it can't be touched at runtime. This
// reduces each kanji to a fixed-size geometric signature the matcher can scan in
// a few milliseconds.
//
// Per stroke we keep 3 points evenly spaced by arc length (start, middle, end),
// each coordinate quantised to one byte over KanjiVG's 0–109 box. Two points
// can't tell a curve from the straight line between its endpoints; the midpoint
// buys that back for 2 bytes. Output, keyed by character:
//   { "日": "<base64 of 6 bytes per stroke>" }
//
// Re-run after changing kanji.json or the KanjiVG files:  npm run build:strokes

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

// KanjiVG's coordinate box, and the points kept per stroke. POINTS must match
// SIGNATURE_POINTS in src/lib/drawSearch.ts — the drawing is resampled the same
// way, and the two sides are compared index by index.
const VIEWBOX = 109;
const POINTS = 3;

// How finely each cubic is flattened before resampling. 12 is well past the point
// where more changes the sampled points at this quantisation.
const FLATTEN = 12;

// ---- SVG path parsing ----
//
// A full path parser isn't needed: a scan of all 6,702 KanjiVG files shows only
// six commands in use — M/m (moveto) and C/c/S/s (cubic béziers). No lines, arcs,
// quadratics or closepath. Anything else means KanjiVG changed shape, so throw
// rather than silently producing a wrong signature.
function flattenPath(d) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? [];
  const pts = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let ctrlX = 0; // previous cubic's second control point, for S/s reflection
  let ctrlY = 0;
  let cmd = null;

  const num = () => parseFloat(tokens[i++]);

  const cubic = (x1, y1, x2, y2, x, y) => {
    const sx = cx;
    const sy = cy;
    for (let s = 1; s <= FLATTEN; s++) {
      const t = s / FLATTEN;
      const mt = 1 - t;
      const a = mt * mt * mt;
      const b = 3 * mt * mt * t;
      const c = 3 * mt * t * t;
      const e = t * t * t;
      pts.push({
        x: a * sx + b * x1 + c * x2 + e * x,
        y: a * sy + b * y1 + c * y2 + e * y,
      });
    }
    ctrlX = x2;
    ctrlY = y2;
    cx = x;
    cy = y;
  };

  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    // else: an implicit repeat of the previous command's coordinate set

    switch (cmd) {
      case "M":
        cx = num();
        cy = num();
        pts.push({ x: cx, y: cy });
        ctrlX = cx;
        ctrlY = cy;
        break;
      case "m":
        cx += num();
        cy += num();
        pts.push({ x: cx, y: cy });
        ctrlX = cx;
        ctrlY = cy;
        break;
      case "C": {
        const x1 = num();
        const y1 = num();
        const x2 = num();
        const y2 = num();
        cubic(x1, y1, x2, y2, num(), num());
        break;
      }
      case "c": {
        const bx = cx;
        const by = cy;
        const x1 = bx + num();
        const y1 = by + num();
        const x2 = bx + num();
        const y2 = by + num();
        cubic(x1, y1, x2, y2, bx + num(), by + num());
        break;
      }
      case "S": {
        const x1 = 2 * cx - ctrlX;
        const y1 = 2 * cy - ctrlY;
        const x2 = num();
        const y2 = num();
        cubic(x1, y1, x2, y2, num(), num());
        break;
      }
      case "s": {
        const bx = cx;
        const by = cy;
        const x1 = 2 * bx - ctrlX;
        const y1 = 2 * by - ctrlY;
        const x2 = bx + num();
        const y2 = by + num();
        cubic(x1, y1, x2, y2, bx + num(), by + num());
        break;
      }
      default:
        throw new Error(`Unsupported path command "${cmd}" in: ${d}`);
    }
  }

  return pts;
}

// Resample a polyline to N points evenly spaced by arc length. Mirrors
// `resample` in src/lib/strokeMatch.ts so both sides of a comparison are built
// the same way.
function resample(points, samples) {
  if (points.length === 0) return [];
  if (points.length === 1) {
    return Array.from({ length: samples }, () => points[0]);
  }

  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return Array.from({ length: samples }, () => points[0]);

  const out = [];
  for (let i = 0; i < samples; i++) {
    const target = (total * i) / (samples - 1);
    let j = 1;
    while (j < cum.length - 1 && cum[j] < target) j++;
    const a = cum[j - 1];
    const b = cum[j];
    const t = b === a ? 0 : (target - a) / (b - a);
    out.push({
      x: points[j - 1].x + (points[j].x - points[j - 1].x) * t,
      y: points[j - 1].y + (points[j].y - points[j - 1].y) * t,
    });
  }
  return out;
}

const quantise = (v) =>
  Math.max(0, Math.min(255, Math.round((v / VIEWBOX) * 255)));

// ---- Build ----
const index = {};
let missing = 0;
let totalStrokes = 0;
let noStrokes = 0;

for (const k of kanji) {
  const ch = k.character;
  const file = resolve(root, "public/kanjiVG", toSvgName(ch));
  if (!existsSync(file)) {
    missing++;
    continue;
  }

  const svg = readFileSync(file, "utf8");
  // Only the drawing group; StrokeNumbers holds <text> labels, not geometry.
  const body = svg.split("StrokeNumbers")[0];
  const paths = [...body.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  if (paths.length === 0) {
    noStrokes++;
    continue;
  }

  const bytes = Buffer.alloc(paths.length * POINTS * 2);
  paths.forEach((d, s) => {
    const sampled = resample(flattenPath(d), POINTS);
    sampled.forEach((p, n) => {
      bytes[s * POINTS * 2 + n * 2] = quantise(p.x);
      bytes[s * POINTS * 2 + n * 2 + 1] = quantise(p.y);
    });
  });

  index[ch] = bytes.toString("base64");
  totalStrokes += paths.length;
}

const outPath = resolve(root, "src/data/kanjiStrokeIndex.json");
writeFileSync(outPath, JSON.stringify(index));

const size = readFileSync(outPath).length;
console.log(`Wrote ${outPath}`);
console.log(
  `  ${Object.keys(index).length} kanji | ${totalStrokes} strokes | ` +
    `${missing} missing SVG | ${noStrokes} with no stroke paths`,
);
console.log(`  size: ${(size / 1024).toFixed(1)} KB`);
