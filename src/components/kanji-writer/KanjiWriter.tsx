import { useEffect, useMemo, useRef, useState } from "react";
import "./KanjiWriter.css";
import { loadKanjiStrokes, strokeStartPoint } from "../../lib/kanjiVg";
import {
  buildTemplate,
  findMatchingStroke,
  matchStroke,
  clampMagnitude,
  DEFAULT_THRESHOLDS,
  type Point,
} from "../../lib/strokeMatch";

// Why a stroke was rejected, in the only terms worth showing the learner.
type MissKind = "shape" | "order";

// How the attempt went, for skill tracking. Misses and hints are counted across
// a Clear on purpose — restarting after three failed strokes is still evidence
// you didn't know it.
export type WriteResult = {
  strokes: number; // template stroke count
  misses: number; // strokes rejected before completing
  hints: number; // hints used
  ms: number; // first stroke -> completion
};

type Props = {
  kanji: string;
  guide: boolean;
  onComplete: (result: WriteResult) => void;
};

export default function KanjiWriter({ kanji, guide, onComplete }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointsRef = useRef<Point[]>([]);

  // Attempt tally — refs, since none of it should trigger a re-render.
  const missesRef = useRef(0);
  const hintsRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);

  // Running drawing-frame offset: the summed per-stroke translation of the strokes
  // accepted so far, divided by their count and capped, gives how far this
  // character sits from the template. Later strokes are matched against that frame,
  // so a consistent whole-character offset doesn't fight the learner. Reset on
  // Clear (and naturally on remount when the kanji changes).
  const offsetSumRef = useRef<Point>({ x: 0, y: 0 });
  const offsetCountRef = useRef(0);
  const frameOffset = (): Point => {
    const n = offsetCountRef.current;
    if (n === 0) return { x: 0, y: 0 };
    return clampMagnitude(
      { x: offsetSumRef.current.x / n, y: offsetSumRef.current.y / n },
      DEFAULT_THRESHOLDS.maxOffset,
    );
  };

  const [strokes, setStrokes] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [accepted, setAccepted] = useState<Point[][]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [miss, setMiss] = useState<MissKind | null>(null);
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState(false);

  // Sample each stroke once per kanji rather than once per attempt.
  const templates = useMemo(() => strokes.map(buildTemplate), [strokes]);

  // Deferred UI beats (the "Correct!" pause, the hint flash) must not outlive the
  // component — otherwise finishing a kanji and navigating away still advances.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    let active = true;
    loadKanjiStrokes(kanji).then((s) => {
      if (active) setStrokes(s);
    });
    return () => {
      active = false;
    };
  }, [kanji]);

  // `touch-action: none` isn't reliably honored on SVG elements on mobile, so
  // stop the page from scrolling while drawing with a non-passive touch guard.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchmove", prevent, { passive: false });
    el.addEventListener("touchstart", prevent, { passive: false });
    return () => {
      el.removeEventListener("touchmove", prevent);
      el.removeEventListener("touchstart", prevent);
    };
  }, []);

  const toSvg = (e: React.PointerEvent): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 109,
      y: ((e.clientY - rect.top) / rect.height) * 109,
    };
  };

  const handleDown = (e: React.PointerEvent) => {
    if (done || strokes.length === 0) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    startedAtRef.current ??= Date.now();
    setDrawing(true);
    setMiss(null);
    pointsRef.current = [toSvg(e)];
    setPoints(pointsRef.current);
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const next = [...pointsRef.current, toSvg(e)];
    pointsRef.current = next;
    setPoints(next);
  };

  const handleUp = (e: React.PointerEvent) => {
    if (!drawing) return;
    e.preventDefault();
    setDrawing(false);

    const userPts = pointsRef.current;
    pointsRef.current = [];
    setPoints([]);
    if (userPts.length === 0) return;

    const offset = frameOffset();
    const res = matchStroke(userPts, templates[current], DEFAULT_THRESHOLDS, offset);
    if (res.ok) {
      // Fold this stroke's translation into the running frame estimate.
      if (res.delta) {
        offsetSumRef.current = {
          x: offsetSumRef.current.x + res.delta.x,
          y: offsetSumRef.current.y + res.delta.y,
        };
        offsetCountRef.current += 1;
      }
      setAccepted((prev) => [...prev, userPts]);
      setHint(false);
      const next = current + 1;
      setCurrent(next);
      if (next >= templates.length) {
        setDone(true);
        const result: WriteResult = {
          strokes: strokes.length,
          misses: missesRef.current,
          hints: hintsRef.current,
          ms: Date.now() - (startedAtRef.current ?? Date.now()),
        };
        later(() => onComplete(result), 700);
      }
    } else {
      missesRef.current++;
      // A well-drawn stroke in the wrong place is usually a *different* stroke of
      // this kanji. Naming that is much more useful than "try again", since
      // stroke order is the thing being taught.
      const other = findMatchingStroke(userPts, templates, current, DEFAULT_THRESHOLDS, offset);
      setMiss(other === -1 ? "shape" : "order");
    }
  };

  const handleClear = () => {
    pointsRef.current = [];
    offsetSumRef.current = { x: 0, y: 0 };
    offsetCountRef.current = 0;
    setAccepted([]);
    setCurrent(0);
    setPoints([]);
    setMiss(null);
    setHint(false);
    setDone(false);
  };

  const handleHint = () => {
    hintsRef.current++;
    setHint(true);
    later(() => setHint(false), 900);
  };

  const poly = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
  const startDot =
    !done && strokes[current] ? strokeStartPoint(strokes[current]) : null;

  return (
    <div className="kanji-writer">
      <svg
        ref={svgRef}
        className="kanji-writer-canvas"
        viewBox="0 0 109 109"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      >
        <line x1="0" y1="54.5" x2="109" y2="54.5" className="kw-grid" />
        <line x1="54.5" y1="0" x2="54.5" y2="109" className="kw-grid" />

        {/* faint full template while guiding */}
        {guide &&
          strokes.map((d, i) => (
            <path
              key={`t${i}`}
              d={d}
              className={`kw-template${i === current ? " current" : ""}`}
            />
          ))}

        {/* hint flash for the current stroke when not guiding */}
        {!guide && hint && strokes[current] && (
          <path d={strokes[current]} className="kw-template current" />
        )}

        {/* start dot for the expected stroke */}
        {(guide || hint) && startDot && (
          <circle cx={startDot.x} cy={startDot.y} r={3.5} className="kw-startdot" />
        )}

        {/* locked-in strokes */}
        {accepted.map((pts, i) => (
          <polyline key={`a${i}`} points={poly(pts)} className="kw-ink" />
        ))}

        {/* live stroke */}
        {points.length > 0 && (
          <polyline
            points={poly(points)}
            className={`kw-live${miss ? " miss" : ""}`}
          />
        )}
      </svg>

      <div className="kanji-writer-status">
        {done ? (
          <span className="kw-done">✓ Correct!</span>
        ) : miss === "order" ? (
          <span className="kw-miss">✗ Right shape — wrong order</span>
        ) : miss ? (
          <span className="kw-miss">✗ Try again</span>
        ) : (
          <span className="kw-progress">
            Stroke {Math.min(current + 1, strokes.length || 1)} of{" "}
            {strokes.length || "…"}
          </span>
        )}
      </div>

      <div className="kanji-writer-actions">
        <button className="kw-button" onClick={handleHint} disabled={done}>
          Hint
        </button>
        <button className="kw-button" onClick={handleClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
