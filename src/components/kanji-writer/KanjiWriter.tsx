import { useEffect, useRef, useState } from "react";
import "./KanjiWriter.css";
import { loadKanjiStrokes, strokeStartPoint } from "../../lib/kanjiVg";
import { matchStroke, type Point } from "../../lib/strokeMatch";

type Props = {
  kanji: string;
  guide: boolean;
  onComplete: () => void;
};

export default function KanjiWriter({ kanji, guide, onComplete }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointsRef = useRef<Point[]>([]);

  const [strokes, setStrokes] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [accepted, setAccepted] = useState<Point[][]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [miss, setMiss] = useState(false);
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    loadKanjiStrokes(kanji).then((s) => {
      if (active) setStrokes(s);
    });
    return () => {
      active = false;
    };
  }, [kanji]);

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
    setDrawing(true);
    setMiss(false);
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

    const res = matchStroke(userPts, strokes[current]);
    if (res.ok) {
      setAccepted((prev) => [...prev, userPts]);
      setHint(false);
      const next = current + 1;
      setCurrent(next);
      if (next >= strokes.length) {
        setDone(true);
        setTimeout(onComplete, 700);
      }
    } else {
      setMiss(true);
    }
  };

  const handleClear = () => {
    pointsRef.current = [];
    setAccepted([]);
    setCurrent(0);
    setPoints([]);
    setMiss(false);
    setHint(false);
    setDone(false);
  };

  const handleHint = () => {
    setHint(true);
    setTimeout(() => setHint(false), 900);
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
