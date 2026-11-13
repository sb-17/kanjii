// Lenient stroke matching for handwriting practice.
// Everything works in the KanjiVG 109x109 coordinate space.

export type Point = { x: number; y: number };

// 32, not 16: a multi-corner stroke (弟's ㇉) needs a few samples per segment for
// the alignment and the local-direction check to see its corners.
const SAMPLES = 32;

// A template stroke, pre-sampled.
//
// Building one needs SVG geometry APIs; matching one doesn't. Keeping them apart
// means matchStroke is pure (testable without a DOM) and the sampling happens
// once per kanji instead of once per stroke attempt.
export type StrokeTemplate = {
  points: Point[]; // resampled to SAMPLES, evenly spaced by arc length
  length: number; // total path length
  chord: Point; // start -> end vector
  chordLen: number;
};

// A tolerance that scales with stroke length. A fixed window is wrong at both
// ends: 25 units is most of a 20-unit tick, so anything nearby passes, while the
// same 25 is tight on an 80-unit sweep.
export type Tolerance = { ratio: number; min: number; max: number };

export type MatchThresholds = {
  endpoints: Tolerance; // how far the user's endpoints may sit from the template's
  meanDist: Tolerance; // average per-point distance along the stroke
  maxDev: Tolerance; // worst single-point distance — catches a wild bulge the mean hides
  minLenRatio: number; // user stroke must be at least this fraction of template length
  dotLen: number; // templates shorter than this are treated as dots
  dotRadius: number; // a tap within this of a dot counts
  chordMin: number; // below this the template's chord is too short to give a direction
  minChordCos: number; // user and template chords must agree to at least this cosine
  offDirCos: number; // a sample whose local direction agrees less than this is "off-direction"
  maxOffDir: number; // fraction of aligned samples allowed to be off-direction
  warpBand: number; // how far (fraction of SAMPLES) the alignment may slide along the stroke
  longStroke: number; // strokes longer than this get proportionally higher tolerance caps…
  maxCapScale: number; // …up to this multiple
  maxOffset: number; // cap on the drawing-frame offset (see clampMagnitude)
  firstStrokeShift: number; // with no frame yet, how much of a stroke's own offset is forgiven
  overshootWeight: number; // fraction of an endpoint's overshoot (past the stroke's end, along it) that counts
};

// The caps sit a touch above the old fixed thresholds (endpoints 25, meanDist 22,
// tuned on a real touchscreen 2026-06-15), and the ratios only bite well below
// full stroke length. The first cut scaled from ~71 units down, which quietly
// tightened most real strokes and felt too strict on-device; these keep near-old
// leniency for anything but the shortest ticks, where scaling still rejects a
// stroke drawn in clearly the wrong place.
//
// maxDev is a loose safety net for a single wild point the mean hides — not a
// gate. Re-tuned and confirmed on a real touchscreen 2026-07-17.
export const DEFAULT_THRESHOLDS: MatchThresholds = {
  endpoints: { ratio: 0.6, min: 20, max: 28 },
  meanDist: { ratio: 0.55, min: 18, max: 24 },
  maxDev: { ratio: 1.1, min: 40, max: 55 },
  minLenRatio: 0.35,
  dotLen: 8,
  dotRadius: 18,
  chordMin: 8,
  // cos 0.5 = within 60°. It used to be 0 (anything short of 90°), which let 弟's
  // ㇒ pass for its mirror-image ㇔ — their chords are ~78° apart.
  minChordCos: 0.5,
  // The chord only sees start and end, so a straight line drawn with a bend in it,
  // or a short stroke wobbled the wrong way, still passed. Local direction along
  // the aligned path catches both: a bend's samples point ~90° off the template's.
  // ~70° and 25% leave room for a corner landing a sample or two early, a natural
  // flick at the end, and the short legs of 弟's ㇉ drawn at a sloppy angle —
  // 60°/20% rejected those in simulation (2026-11-13).
  offDirCos: 0.34,
  maxOffDir: 0.25,
  // Points are paired by alignment (DTW) rather than by index, so drawing one
  // segment of a bent stroke longer and the next one shorter doesn't make every
  // later pair disagree. The band bounds how far it may slide.
  warpBand: 0.3,
  // The fixed caps were tuned on ordinary strokes and are tight for a long
  // multi-corner sweep, where proportions drift the most.
  longStroke: 90,
  maxCapScale: 1.3,
  // A whole character written a little off-centre shouldn't fight you: strokes are
  // matched against the template shifted by the frame offset (estimated from the
  // strokes you've already got right), so only *relative* placement is graded.
  // Capped here so a genuinely misplaced stroke — not a consistent shift — still
  // fails. Roughly one endpoint-tolerance's worth. Tune on-device.
  maxOffset: 30,
  // The first stroke has no frame to be shifted by, so it alone was graded on
  // absolute position, and often with the tightest tolerances (a short stroke).
  // Absorb up to this much of its own offset, on top of the endpoint tolerance.
  firstStrokeShift: 15,
  // A line drawn longer than the template is the same stroke; the endpoint check
  // read it as finishing in the wrong place (長's 2nd stroke, 33 units long, failed
  // at +20). Only the part of an endpoint's error that continues the stroke past
  // its end is discounted — sideways or falling short still counts in full, so a
  // stroke in the wrong place still fails on its other end.
  overshootWeight: 0.4,
};

export const ZERO: Point = { x: 0, y: 0 };

// Cap a vector's magnitude, keeping its direction. Used to bound the drawing-frame
// offset so matching stays anchored near the template, not wherever the pen wanders.
export function clampMagnitude(p: Point, max: number): Point {
  const m = Math.hypot(p.x, p.y);
  if (m <= max || m === 0) return p;
  const s = max / m;
  return { x: p.x * s, y: p.y * s };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

// Start -> end vector. Its direction is what tells a stroke apart from the same
// stroke drawn backwards.
function chord(points: Point[]): Point {
  const a = points[0];
  const b = points[points.length - 1];
  return { x: b.x - a.x, y: b.y - a.y };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

const tolerance = (t: Tolerance, length: number, capScale: number) =>
  clamp(t.ratio * length, t.min, t.max * capScale);

// Distance from a user endpoint to the template's, with the part that overshoots
// outward — continuing the stroke past `end`, away from `inner` — scaled by `weight`.
function endpointDev(user: Point, end: Point, inner: Point, weight: number): number {
  const dx = user.x - end.x;
  const dy = user.y - end.y;
  const ox = end.x - inner.x;
  const oy = end.y - inner.y;
  const ol = Math.hypot(ox, oy);
  if (ol === 0) return Math.hypot(dx, dy);
  const along = (dx * ox + dy * oy) / ol;
  if (along <= 0) return Math.hypot(dx, dy);
  const perp = (dx * -oy + dy * ox) / ol;
  return Math.hypot(along * weight, perp);
}

// Local direction at sample i, over a few samples so finger jitter doesn't count.
function tangent(points: Point[], i: number): Point {
  const a = points[Math.max(0, i - 2)];
  const b = points[Math.min(points.length - 1, i + 2)];
  return { x: b.x - a.x, y: b.y - a.y };
}

// Dynamic time warping: the monotonic pairing of a's and b's samples that
// minimises total distance, within `band` samples of the diagonal. Every sample
// of both strokes gets at least one partner, so a missing corner still costs.
function align(a: Point[], b: Point[], band: number): [number, number][] {
  const n = a.length;
  const m = b.length;
  const w = Math.max(band, Math.abs(n - m));
  const acc = Array.from({ length: n }, () => new Array<number>(m).fill(Infinity));
  for (let i = 0; i < n; i++) {
    for (let j = Math.max(0, i - w); j <= Math.min(m - 1, i + w); j++) {
      const d = dist(a[i], b[j]);
      if (i === 0 && j === 0) {
        acc[i][j] = d;
        continue;
      }
      const diag = i > 0 && j > 0 ? acc[i - 1][j - 1] : Infinity;
      const up = i > 0 ? acc[i - 1][j] : Infinity;
      const left = j > 0 ? acc[i][j - 1] : Infinity;
      acc[i][j] = d + Math.min(diag, up, left);
    }
  }
  const path: [number, number][] = [[n - 1, m - 1]];
  let i = n - 1;
  let j = m - 1;
  while (i > 0 || j > 0) {
    const diag = i > 0 && j > 0 ? acc[i - 1][j - 1] : Infinity;
    const up = i > 0 ? acc[i - 1][j] : Infinity;
    const left = j > 0 ? acc[i][j - 1] : Infinity;
    if (diag <= up && diag <= left) {
      i--;
      j--;
    } else if (up <= left) i--;
    else j--;
    path.push([i, j]);
  }
  return path.reverse();
}

// Sample a stroke path's `d` into evenly-spaced points using the DOM path API.
export function sampleStrokePath(d: string, samples = SAMPLES): Point[] {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  const len = path.getTotalLength();
  const pts: Point[] = [];
  for (let i = 0; i < samples; i++) {
    const p = path.getPointAtLength(samples === 1 ? 0 : (len * i) / (samples - 1));
    pts.push({ x: p.x, y: p.y });
  }
  return pts;
}

// Resample an arbitrary polyline to N evenly-spaced points by arc length.
export function resample(points: Point[], samples = SAMPLES): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: samples }, () => points[0]);

  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  const total = cum[cum.length - 1];
  if (total === 0) return Array.from({ length: samples }, () => points[0]);

  const out: Point[] = [];
  for (let i = 0; i < samples; i++) {
    const target = (total * i) / (samples - 1);
    let j = 1;
    while (j < cum.length - 1 && cum[j] < target) j++;
    const segStart = cum[j - 1];
    const segEnd = cum[j];
    const t = segEnd === segStart ? 0 : (target - segStart) / (segEnd - segStart);
    out.push({
      x: points[j - 1].x + (points[j].x - points[j - 1].x) * t,
      y: points[j - 1].y + (points[j].y - points[j - 1].y) * t,
    });
  }
  return out;
}

// Build a template from a path `d`. Cached: the same kanji gets drilled over and
// over, and this used to re-sample the path on every stroke attempt.
const templateCache = new Map<string, StrokeTemplate>();

export function buildTemplate(d: string): StrokeTemplate {
  const cached = templateCache.get(d);
  if (cached) return cached;

  const points = sampleStrokePath(d);
  const c = points.length > 0 ? chord(points) : { x: 0, y: 0 };
  const template: StrokeTemplate = {
    points,
    length: pathLength(points),
    chord: c,
    chordLen: Math.hypot(c.x, c.y),
  };
  templateCache.set(d, template);
  return template;
}

export type MatchReason =
  | "no-template"
  | "far" // tap nowhere near a dot
  | "short" // barely drew anything
  | "endpoints" // started or finished in the wrong place
  | "direction" // drawn backwards
  | "shape" // wrong path overall
  | "wobble"; // mostly right, one part way off

export type MatchResult = {
  ok: boolean;
  // 0..1 quality, 1 being a perfect trace. Meaningful even when `ok` is false —
  // it's what tells "nearly had it" from "nowhere close", and what a skill level
  // gets weighted by.
  score: number;
  reason?: MatchReason;
  // This stroke's own translation from the (unshifted) template — mean of
  // user[i] − template[i]. The caller folds accepted strokes' deltas into the
  // running frame offset. Present only once the stroke reaches shape scoring.
  delta?: Point;
};

// Compare a user-drawn stroke to a template. Lenient by design: this grades a
// learner's thumb on a phone, not a calligrapher.
export function matchStroke(
  userPoints: Point[],
  template: StrokeTemplate,
  thresholds: MatchThresholds = DEFAULT_THRESHOLDS,
  // How far the user's drawing frame sits from the template (from the strokes
  // they've already got right). The template is compared shifted by this, so a
  // consistent whole-character offset stops eating the tolerance budget.
  // null = no frame yet (nothing accepted): the stroke's own offset is used,
  // capped at firstStrokeShift.
  offset: Point | null = ZERO,
): MatchResult {
  if (template.points.length === 0) return { ok: false, score: 0, reason: "no-template" };
  if (userPoints.length === 0) return { ok: false, score: 0, reason: "short" };

  // Dot / tiny stroke: accept a tap near it (shifted into the drawing frame),
  // scored by how near.
  if (template.length < thresholds.dotLen) {
    const o = offset ?? ZERO;
    const c = { x: template.points[0].x + o.x, y: template.points[0].y + o.y };
    let best = Infinity;
    for (const p of userPoints) best = Math.min(best, dist(p, c));
    return best < thresholds.dotRadius
      ? { ok: true, score: clamp01(1 - best / thresholds.dotRadius) }
      : { ok: false, score: 0, reason: "far" };
  }

  if (pathLength(userPoints) < template.length * thresholds.minLenRatio) {
    return { ok: false, score: 0, reason: "short" };
  }

  const tpts = template.points;
  const user = resample(userPoints, tpts.length);
  const last = user.length - 1;

  // Raw (unshifted) displacement, so the running frame offset is measured
  // against the template itself, not against the already-shifted comparison.
  let dsx = 0;
  let dsy = 0;
  for (let i = 0; i < user.length; i++) {
    dsx += user[i].x - tpts[i].x;
    dsy += user[i].y - tpts[i].y;
  }
  const delta: Point = { x: dsx / user.length, y: dsy / user.length };

  const frame = offset ?? clampMagnitude(delta, thresholds.firstStrokeShift);
  // Template shifted into the user's drawing frame.
  const shifted = tpts.map((p) => ({ x: p.x + frame.x, y: p.y + frame.y }));

  const capScale = clamp(template.length / thresholds.longStroke, 1, thresholds.maxCapScale);
  const endTol = tolerance(thresholds.endpoints, template.length, capScale);
  const meanTol = tolerance(thresholds.meanDist, template.length, capScale);
  const devTol = tolerance(thresholds.maxDev, template.length, capScale);

  const endDev = Math.max(
    endpointDev(user[0], shifted[0], shifted[Math.min(3, last)], thresholds.overshootWeight),
    endpointDev(user[last], shifted[last], shifted[Math.max(0, last - 3)], thresholds.overshootWeight),
  );

  const path = align(user, shifted, Math.round(thresholds.warpBand * user.length));
  let sum = 0;
  let maxDev = 0;
  let offDir = 0;
  for (const [i, j] of path) {
    const d = dist(user[i], shifted[j]);
    sum += d;
    if (d > maxDev) maxDev = d;
    const u = tangent(user, i);
    const t = tangent(tpts, j);
    const ul = Math.hypot(u.x, u.y);
    const tl = Math.hypot(t.x, t.y);
    if (ul > 0 && tl > 0 && (u.x * t.x + u.y * t.y) / (ul * tl) < thresholds.offDirCos) offDir++;
  }
  const meanDev = sum / path.length;

  // How far inside each tolerance the stroke sits. Shape carries most of it —
  // endpoints and wobble are secondary. Computed before the accept/reject checks
  // so a rejection still carries a useful "how close was that".
  const score = clamp01(
    0.5 * (1 - meanDev / meanTol) +
      0.25 * (1 - endDev / endTol) +
      0.25 * (1 - maxDev / devTol),
  );

  if (endDev > endTol) return { ok: false, score, reason: "endpoints", delta };

  // Reject strokes drawn backwards. On a long stroke the endpoint check already
  // catches this — a reversed start lands near the template's end, well outside
  // the tolerance. On a short one it doesn't: both endpoints stay inside and the
  // mean distance stays under half the stroke length, so a reversed tick sails
  // through. That's exactly the short strokes in 心 / 火, where direction is the
  // thing learners actually get wrong.
  //
  // Skipped when the template's chord is too short to carry a direction (tight
  // hooks that curve back on themselves).
  if (template.chordLen >= thresholds.chordMin) {
    const uc = chord(user);
    const ucLen = Math.hypot(uc.x, uc.y);
    const cos =
      ucLen === 0
        ? -1
        : (template.chord.x * uc.x + template.chord.y * uc.y) / (template.chordLen * ucLen);
    if (cos < thresholds.minChordCos) return { ok: false, score, reason: "direction", delta };
  }

  // Right place, wrong path: a bend in a straight stroke, or a short stroke
  // heading off at an angle the chord check still lets through.
  if (offDir / path.length > thresholds.maxOffDir) {
    return { ok: false, score, reason: "shape", delta };
  }

  if (meanDev > meanTol) return { ok: false, score, reason: "shape", delta };
  if (maxDev > devTol) return { ok: false, score, reason: "wobble", delta };

  return { ok: true, score, delta };
}

// Which still-upcoming stroke of this kanji the user actually drew, or -1.
//
// Only strokes *after* the current one count. "Wrong order" means "you drew a
// stroke that belongs later" — a stray that happens to match an already-completed
// stroke (easy with a lenient matcher, e.g. a second vertical landing near the
// first) is just a miss, not an ordering mistake. Costs one pass over the
// remaining templates, on a miss only.
export function findMatchingStroke(
  userPoints: Point[],
  templates: StrokeTemplate[],
  current: number,
  thresholds: MatchThresholds = DEFAULT_THRESHOLDS,
  offset: Point | null = ZERO,
): number {
  for (let i = current + 1; i < templates.length; i++) {
    if (matchStroke(userPoints, templates[i], thresholds, offset).ok) return i;
  }
  return -1;
}
