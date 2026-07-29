// Draw-to-search: rank every kanji by how closely it matches a drawing.
//
// Ranking means comparing against all ~2,136 candidates, and the KanjiVG SVGs are
// ~44 MB fetched on demand — so this reads a precomputed signature index instead
// (src/data/kanjiStrokeIndex.json, see scripts/build-stroke-index.mjs). Importing
// this module pulls that ~193 KB in, so it must only ever be reached from a lazy
// chunk — today that's KanjiDrawPad.
//
// Deliberately order-tolerant. Someone looking a kanji up doesn't know its stroke
// order yet — that's why they're looking it up — so requiring the right order
// would defeat the feature. Drawing it correctly still scores better, via a mild
// bonus for strokes that land near their expected position.

import strokeIndexRaw from "../data/kanjiStrokeIndex.json";
import { resample, type Point } from "./strokeMatch";

// KanjiVG's coordinate box. SIGNATURE_POINTS must match POINTS in
// scripts/build-stroke-index.mjs — both sides are resampled the same way and
// compared point by point.
const VIEWBOX = 109;
const SIGNATURE_POINTS = 3;

// What the larger side of a glyph's bounding box is scaled to. Both the drawing
// and the templates go through the same normalisation, so the exact value only
// sets the units distances are reported in; roughly what a KanjiVG glyph spans.
const TARGET_EXTENT = 86;
const CENTER = VIEWBOX / 2;

// Below this the bounding box is a point (a lone dot, a single tap): scaling it up
// would blow numerical noise into a full-size glyph, so leave it be and just centre.
const MIN_EXTENT = 1e-3;

// How much of the difference between a glyph's aspect ratio and square is taken
// out, on both the drawing and the templates. 0 keeps the shape as drawn, 1 fits
// every glyph to a square.
//
// This has to be high. 日 is genuinely narrow (w/h 0.73) but people draw it square,
// because the canvas is square and you don't know the proportions of a kanji you're
// looking up. Left uncorrected, a square-ish 日 ranked *third*, behind 囚 (0.89) and
// 田 (1.12) — the ranking was decided by proportions rather than by the one middle
// bar that actually identifies it.
const ASPECT_CORRECTION = 1;

// An axis thinner than this fraction of the other carries no aspect information —
// 一 is a line, not a wide flat glyph — so it keeps the uniform scale instead of
// being stretched to fill the box.
const MIN_AXIS_RATIO = 0.25;

// Cost charged for a stroke on either side that finds no partner. Kept modest on
// purpose: stroke-for-stroke pairing punishes a split or merged stroke twice
// over — once for the orphan, once for the halves that now match nothing well —
// and someone looking a kanji up is exactly the person who doesn't know where one
// stroke ends. The ink map below is what carries the shape when pairing fails.
const UNMATCHED_COST = 20;

// Per stroke of positional drift, added to a candidate pairing. Small on purpose:
// it breaks ties toward the conventional order without ruling out other orders.
// Splitting a stroke shifts every later index by one, so this has to stay gentle.
const ORDER_WEIGHT = 0.7;

// Resolution of the stroke-count-independent ink map (see inkGrid). 8×8 is coarse
// enough that drawing a stroke slightly differently barely moves it, fine enough
// to tell 日 from 目 or 田.
const INK_GRID = 8;

// How much the ink map counts relative to stroke pairing.
//
// Low, and that matters. This was 20 while greedy pairing still walked strokes in
// drawn order, because ink was the only thing holding a split stroke together —
// but once pairing was fixed to take confident pairs first, the high weight was
// left behind compensating for a bug that no longer existed, and it actively
// overruled correct answers. A 本 whose *stroke* cost was the best of any
// candidate (14.5, beating 朱 and 兼) came 19th because ink contributed more than
// half its total. Dropping to 6 moved it to 4th and improved nearly every
// benchmark scenario at the same time.
//
// Not zero, though: at 0 the two-strokes-split case falls from 95.6% to 92.0%,
// so ink still earns its keep for the cases pairing can't explain.
const INK_WEIGHT = 6;

// Added when a stroke only matches once reversed. Learners who don't know a kanji
// often don't know which way its strokes run, so this is forgiven — but not free,
// since direction is real information.
const REVERSAL_PENALTY = 6;

// NOTE: there is deliberately no "only score the best N candidates" cutoff here.
// One was tried (700 of 2,136, by ink distance) and it silently dropped correct
// answers: a 本 that a full scan ranked 19th didn't survive the cut at all, so it
// was missing from the results entirely rather than merely ranked low. A cheap
// filter that can discard the right answer is the worst failure this feature has.
// Speed comes from the admissible bound in searchByDrawing instead, which skips
// candidates only when they provably cannot place.

type Signature = { char: string; strokes: Point[][]; ink: Float32Array };

// ---- Index (decoded once, lazily) ----

let signatures: Signature[] | null = null;

function loadSignatures(): Signature[] {
  if (signatures) return signatures;

  const raw = strokeIndexRaw as Record<string, string>;
  signatures = Object.entries(raw).map(([char, b64]) => {
    const bin = atob(b64);
    const strokeCount = bin.length / (SIGNATURE_POINTS * 2);
    const strokes: Point[][] = [];
    for (let s = 0; s < strokeCount; s++) {
      const pts: Point[] = [];
      for (let p = 0; p < SIGNATURE_POINTS; p++) {
        const o = s * SIGNATURE_POINTS * 2 + p * 2;
        pts.push({
          x: (bin.charCodeAt(o) / 255) * VIEWBOX,
          y: (bin.charCodeAt(o + 1) / 255) * VIEWBOX,
        });
      }
      strokes.push(pts);
    }
    // Normalised up front: it's the same work every search would otherwise redo
    // for every candidate.
    const placed = normalise(strokes);
    return { char, strokes: placed, ink: inkGrid(placed) };
  });
  return signatures;
}

// ---- Geometry ----

// Scale a glyph's bounding box to a standard extent and centre it. Both sides of
// a comparison get this, so it doesn't matter how big, where, or — via
// ASPECT_CORRECTION — in what proportions someone draws.
//
// Each axis is fitted separately, but only while both are substantial. A glyph
// that's essentially a line (一, 丨) falls back to uniform scaling by the larger
// side: stretching a 4-unit-tall bounding box to fill the box would turn 一 into
// a shape it has never been.
export function normalise(strokes: Point[][]): Point[][] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return strokes;

  const width = maxX - minX;
  const height = maxY - minY;
  const extent = Math.max(width, height);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  if (extent < MIN_EXTENT) {
    return strokes.map((stroke) =>
      stroke.map((p) => ({ x: p.x - cx + CENTER, y: p.y - cy + CENTER })),
    );
  }

  const uniform = TARGET_EXTENT / extent;
  const axis = (span: number) =>
    span >= extent * MIN_AXIS_RATIO ? TARGET_EXTENT / span : uniform;
  const scaleX = uniform + (axis(width) - uniform) * ASPECT_CORRECTION;
  const scaleY = uniform + (axis(height) - uniform) * ASPECT_CORRECTION;

  return strokes.map((stroke) =>
    stroke.map((p) => ({
      x: (p.x - cx) * scaleX + CENTER,
      y: (p.y - cy) * scaleY + CENTER,
    })),
  );
}

// Where the ink lands, as a normalised INK_GRID² distribution — and nothing else.
// It has no idea how many strokes made it, which is the whole point: 日 drawn as
// four strokes and 日 drawn as five put ink in the same places, so this still
// recognises it when stroke-for-stroke pairing has fallen apart.
//
// Ink is spread bilinearly into the four neighbouring cells rather than dropped
// into one, so a stroke landing a hair across a cell boundary shifts the map
// slightly instead of jumping it. Each sample is weighted by the length it stands
// for, so the map measures ink, not sampling density.
function inkGrid(strokes: Point[][]): Float32Array {
  const grid = new Float32Array(INK_GRID * INK_GRID);
  const cell = VIEWBOX / INK_GRID;

  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1];
      const b = stroke[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(len / (cell / 2)));
      const w = len / steps;

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        // Cell centres sit at (i + 0.5) * cell, so shift before flooring.
        const fx = (a.x + (b.x - a.x) * t) / cell - 0.5;
        const fy = (a.y + (b.y - a.y) * t) / cell - 0.5;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;

        for (let dy = 0; dy <= 1; dy++) {
          const gy = y0 + dy;
          if (gy < 0 || gy >= INK_GRID) continue;
          for (let dx = 0; dx <= 1; dx++) {
            const gx = x0 + dx;
            if (gx < 0 || gx >= INK_GRID) continue;
            grid[gy * INK_GRID + gx] +=
              w * (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty);
          }
        }
      }
    }
  }

  // Normalise to a distribution, so drawing bigger or with longer strokes doesn't
  // register as "more kanji". Anything clipped outside the grid drops out here.
  let total = 0;
  for (let i = 0; i < grid.length; i++) total += grid[i];
  if (total > 0) for (let i = 0; i < grid.length; i++) grid[i] /= total;
  return grid;
}

// L1 distance between two ink maps, 0 (identical) to 2 (no overlap at all).
function inkDistance(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d;
}

// Mean point-to-point distance between two signatures, taking the better of the
// two orientations. The sampled points carry direction implicitly (a backwards
// stroke puts its start where the template's end is), so reversal needs no
// separate term — just the option to forgive it at a price.
function strokeDistance(a: Point[], b: Point[]): number {
  let forward = 0;
  let backward = 0;
  for (let i = 0; i < SIGNATURE_POINTS; i++) {
    const j = SIGNATURE_POINTS - 1 - i;
    forward += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
    backward += Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y);
  }
  return Math.min(forward, backward + REVERSAL_PENALTY * SIGNATURE_POINTS) /
    SIGNATURE_POINTS;
}

// Total cost of explaining a drawing with one candidate's strokes.
//
// Greedy rather than optimal (Hungarian) assignment: with ~10 strokes a side the
// difference is rare and the greedy pass is what keeps a full 2,136-candidate scan
// inside a few milliseconds, which is what lets results refresh on every stroke.
// Cheapest fit of one stroke against any of a set, ignoring whether it's already
// spoken for. What a leftover stroke costs once one-to-one pairing runs out.
function bestFit(stroke: Point[], others: Point[][]): number {
  let best = Infinity;
  for (const other of others) {
    const d = strokeDistance(stroke, other);
    if (d < best) best = d;
  }
  return best;
}

// Reused across candidates so a full 2,136-candidate scan stays allocation-free.
let costScratch = new Float64Array(0);

function matchCost(drawn: Point[][], template: Point[][]): number {
  const nd = drawn.length;
  const nt = template.length;

  if (costScratch.length < nd * nt) costScratch = new Float64Array(nd * nt);
  const cost2d = costScratch;
  for (let u = 0; u < nd; u++) {
    for (let t = 0; t < nt; t++) {
      cost2d[u * nt + t] =
        strokeDistance(drawn[u], template[t]) + ORDER_WEIGHT * Math.abs(t - u);
    }
  }

  const usedU = new Array<boolean>(nd).fill(false);
  const usedT = new Array<boolean>(nt).fill(false);
  let cost = 0;

  // Confident pairs first — repeatedly take the cheapest pairing still available,
  // rather than walking strokes in the order they were drawn.
  //
  // Drawn order is what broke 日 with its フ split in two: the stray top-horizontal
  // came up early, matched the *middle bar* better than anything else left, and
  // took it — so the real middle bar arrived to find its partner gone. Every later
  // stroke then paid for one ambiguous early guess. Taking the obvious pairs
  // (the verticals, the bars) first leaves the ambiguous strokes to sort out what
  // remains, which is the order a person would do it in.
  const pairs = Math.min(nd, nt);
  for (let k = 0; k < pairs; k++) {
    let best = Infinity;
    let bu = -1;
    let bt = -1;
    for (let u = 0; u < nd; u++) {
      if (usedU[u]) continue;
      for (let t = 0; t < nt; t++) {
        if (usedT[t]) continue;
        const c = cost2d[u * nt + t];
        if (c < best) {
          best = c;
          bu = u;
          bt = t;
        }
      }
    }
    if (bu === -1) break;
    usedU[bu] = true;
    usedT[bt] = true;
    cost += best;
  }

  // Whatever's left over on either side is most likely half of a stroke already
  // matched (a split), or covered by one that ran two together (a merge). Charge
  // it against the stroke it plausibly belongs to rather than a flat penalty,
  // capped so genuine junk still isn't free.
  for (let u = 0; u < nd; u++) {
    if (!usedU[u]) cost += Math.min(UNMATCHED_COST, bestFit(drawn[u], template));
  }
  for (let t = 0; t < nt; t++) {
    if (!usedT[t]) cost += Math.min(UNMATCHED_COST, bestFit(template[t], drawn));
  }

  // Per-stroke average, so a 3-stroke kanji and a 20-stroke one are comparable.
  return cost / Math.max(nd, nt);
}

export type DrawMatch = { char: string; score: number };

// Rank every kanji against a drawing, closest first. `strokes` is raw pointer
// polylines in any coordinate space — they're resampled and normalised here.
export function searchByDrawing(
  strokes: Point[][],
  limit = 30,
): DrawMatch[] {
  const usable = strokes.filter((s) => s.length > 0);
  if (usable.length === 0) return [];

  const drawn = normalise(usable.map((s) => resample(s, SIGNATURE_POINTS)));
  // From the same 3-point form the templates are stored in. Using the dense
  // polyline here instead would trace real curves against the templates' two
  // straight segments — a systematic difference on every comparison.
  const drawnInk = inkGrid(drawn);

  const sigs = loadSignatures();

  // Pass 1 — ink only, over everything. 64 subtractions per candidate.
  const ink = new Float64Array(sigs.length);
  for (let i = 0; i < sigs.length; i++) {
    ink[i] = inkDistance(drawnInk, sigs[i].ink);
  }
  const order = Array.from(ink.keys()).sort((a, b) => ink[a] - ink[b]);

  // Pass 2 — stroke matching, cheapest-ink-first, with an admissible bound.
  //
  // A candidate's final score is `matchCost + INK_WEIGHT * ink`, and matchCost is
  // never negative, so `INK_WEIGHT * ink` is a floor on it. Walking in ascending
  // ink order, the moment that floor reaches the worst score already held in the
  // result set, every remaining candidate is also beyond it — so the loop can stop
  // outright. That makes this exactly as accurate as scoring all 2,136 while
  // usually paying for a fraction of them, which a "best N by ink" cutoff can't
  // claim: this only ever skips candidates that provably cannot place.
  const best: DrawMatch[] = [];
  let worst = Infinity;

  for (const i of order) {
    const floor = INK_WEIGHT * ink[i];
    if (best.length === limit && floor >= worst) break;

    const score = matchCost(drawn, sigs[i].strokes) + floor;
    if (best.length === limit && score >= worst) continue;

    let at = best.length;
    while (at > 0 && best[at - 1].score > score) at--;
    best.splice(at, 0, { char: sigs[i].char, score });
    if (best.length > limit) best.pop();
    worst = best[best.length - 1].score;
  }

  return best;
}
