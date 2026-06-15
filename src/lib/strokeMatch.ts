// Lenient stroke matching for handwriting practice.
// Everything works in the KanjiVG 109x109 coordinate space.

export type Point = { x: number; y: number };

const SAMPLES = 16;

// Tunable thresholds (in 109-space units).
const START_END_MAX = 30; // how far the user's endpoints may be from the template's
const MEAN_DIST_MAX = 22; // average per-point distance allowed along the stroke
const DOT_LEN = 8; // template strokes shorter than this are treated as dots
const DOT_RADIUS = 18; // a tap within this of a dot counts
const MIN_LEN_RATIO = 0.35; // user stroke must be at least this fraction of template length

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
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

export type MatchResult = { ok: boolean; reason?: string };

// Compare a user-drawn stroke to a template stroke path. Lenient: checks the
// endpoints, the average distance along the stroke, and (implicitly, by comparing
// point-for-point from start to end) the drawing direction.
export function matchStroke(userPoints: Point[], templateD: string): MatchResult {
  const template = sampleStrokePath(templateD);
  if (template.length === 0) return { ok: false, reason: "no-template" };

  const tmplLen = pathLength(template);

  // Dot / tiny stroke: accept a tap near it.
  if (tmplLen < DOT_LEN) {
    const c = template[0];
    return userPoints.some((p) => dist(p, c) < DOT_RADIUS)
      ? { ok: true }
      : { ok: false, reason: "far" };
  }

  if (pathLength(userPoints) < tmplLen * MIN_LEN_RATIO) {
    return { ok: false, reason: "short" };
  }

  const user = resample(userPoints);
  if (
    dist(user[0], template[0]) > START_END_MAX ||
    dist(user[user.length - 1], template[template.length - 1]) > START_END_MAX
  ) {
    return { ok: false, reason: "endpoints" };
  }

  let sum = 0;
  for (let i = 0; i < user.length; i++) sum += dist(user[i], template[i]);
  if (sum / user.length > MEAN_DIST_MAX) return { ok: false, reason: "shape" };

  return { ok: true };
}
