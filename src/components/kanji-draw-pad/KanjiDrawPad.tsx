import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./KanjiDrawPad.css";
import { searchByDrawing } from "../../lib/drawSearch";
import type { Point } from "../../lib/strokeMatch";

// Draw a kanji to look it up. Deliberately *not* KanjiWriter: that one knows
// which kanji you're aiming at and grades each stroke against it. Here nothing is
// known — strokes are just collected and handed to the matcher, which ranks the
// whole dataset. No templates, no validation, no hints.
//
// A dialog rather than an inline panel, so opening it doesn't shove the list
// down the page. The closest few matches show inside it, so you can find what you
// drew without dismissing it first; the full ranking is in the list behind.
//
// This component is the only route to lib/drawSearch, which pulls in the ~193 KB
// signature index — so it must stay lazily imported (see KanjiList).

type Props = {
  // Ranked characters, or null when the pad is empty and the normal list should
  // come back.
  onMatches: (chars: string[] | null) => void;
  onClose: () => void;
};

const RESULTS = 30;
// How many of those to show as chips inside the dialog.
const PREVIEW = 12;

export default function KanjiDrawPad({ onMatches, onClose }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointsRef = useRef<Point[]>([]);

  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [preview, setPreview] = useState<string[]>([]);

  // `touch-action: none` isn't reliably honored on SVG elements on mobile, so
  // stop the page from scrolling while drawing with a non-passive touch guard.
  // (Same guard KanjiWriter needs.)
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Re-rank after every change. A full scan is ~30ms, so there's no need to
  // debounce — and updating per stroke is what makes it feel like a search.
  const commit = (next: Point[][]) => {
    setStrokes(next);
    const matches =
      next.length === 0 ? null : searchByDrawing(next, RESULTS).map((m) => m.char);
    setPreview(matches?.slice(0, PREVIEW) ?? []);
    onMatches(matches);
  };

  const toSvg = (e: React.PointerEvent): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 109,
      y: ((e.clientY - rect.top) / rect.height) * 109,
    };
  };

  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrawing(true);
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

    const drawn = pointsRef.current;
    pointsRef.current = [];
    setPoints([]);
    if (drawn.length === 0) return;
    commit([...strokes, drawn]);
  };

  // Undo matters more here than in the writer: one bad stroke shouldn't cost you
  // the whole character.
  const handleUndo = () => commit(strokes.slice(0, -1));
  const handleClear = () => commit([]);

  const poly = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
  const empty = strokes.length === 0;

  return (
    <div
      className="draw-pad-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Search by drawing"
    >
      <div className="draw-pad-backdrop" onClick={onClose} />

      <div className="draw-pad-modal">
        <div className="draw-pad-head">
          <span className="draw-pad-title">Draw a kanji</span>
          <button
            type="button"
            className="draw-pad-close"
            onClick={onClose}
            aria-label="Close drawing search"
          >
            ✕
          </button>
        </div>

        <svg
          ref={svgRef}
          className="draw-pad-canvas"
          viewBox="0 0 109 109"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
        >
          <line x1="0" y1="54.5" x2="109" y2="54.5" className="draw-pad-grid" />
          <line x1="54.5" y1="0" x2="54.5" y2="109" className="draw-pad-grid" />

          {strokes.map((pts, i) => (
            <polyline key={i} points={poly(pts)} className="draw-pad-ink" />
          ))}
          {points.length > 0 && (
            <polyline points={poly(points)} className="draw-pad-ink live" />
          )}
        </svg>

        <div className="draw-pad-results">
          {empty ? (
            <p className="draw-pad-hint">
              Stroke order and stroke count don't have to be right.
            </p>
          ) : (
            <div className="draw-pad-chips">
              {preview.map((ch) => (
                <Link
                  key={ch}
                  to={`/kanji/${encodeURIComponent(ch)}`}
                  className="draw-pad-chip"
                >
                  {ch}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="draw-pad-actions">
          <button
            type="button"
            className="draw-pad-button"
            onClick={handleUndo}
            disabled={empty}
          >
            Undo
          </button>
          <button
            type="button"
            className="draw-pad-button"
            onClick={handleClear}
            disabled={empty}
          >
            Clear
          </button>
          <button
            type="button"
            className="draw-pad-button draw-pad-button-primary"
            onClick={onClose}
            disabled={empty}
          >
            See all {RESULTS}
          </button>
        </div>
      </div>
    </div>
  );
}
