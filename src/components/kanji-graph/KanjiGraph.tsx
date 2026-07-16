import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getNeighborhood,
  type GraphMode,
} from "../../lib/kanjiGraph";
import {
  layoutNeighborhood,
  R_CENTER,
  R_CONNECTOR,
  R_KANJI,
  type GraphNode,
} from "../../lib/graphLayout";
import type { KanjiProgress, KanjiStatus } from "../../types/kanjiProgress";
import "./KanjiGraph.css";

type Props = {
  center: string;
  mode: GraphMode;
  progress: KanjiProgress;
  onSelect: (char: string) => void;
};

type ViewBox = [x: number, y: number, w: number, h: number];

const radiusFor = (node: GraphNode) =>
  node.kind === "kanji" ? R_KANJI : node.kind === "connector" ? R_CONNECTOR : R_CENTER;

// Connector labels can be 2–3 kana (readings); shrink the glyph so it fits.
const connectorFontSize = (label: string) =>
  label.length >= 3 ? 11 : label.length === 2 ? 15 : 21;

const parseViewBox = (s: string): ViewBox => {
  const [x, y, w, h] = s.split(" ").map(Number);
  return [x, y, w, h];
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const MIN_ZOOM = 0.25; // smallest viewBox width as a fraction of base (max zoom-in)
const MAX_ZOOM = 1.8; // largest viewBox width as a fraction of base (zoom-out)

export default function KanjiGraph({ center, mode, progress, onSelect }: Props) {
  const layout = useMemo(
    () => layoutNeighborhood(getNeighborhood(center, mode)),
    [center, mode],
  );
  const hasNeighbors = layout.nodes.length > 1;

  const containerRef = useRef<HTMLDivElement | null>(null);

  // The fit-to-view box for the current neighborhood. Purely derived from the
  // layout, so it's a memo rather than a ref kept in sync by hand.
  const baseVB = useMemo(() => parseViewBox(layout.viewBox), [layout.viewBox]);
  const [vb, setVb] = useState<ViewBox>(baseVB);

  // Reset the view whenever the neighborhood changes (recenter / mode switch).
  // Adjusted during render rather than in an effect so the new graph never paints
  // for a frame under the previous viewBox.
  const [lastViewBox, setLastViewBox] = useState(layout.viewBox);
  if (layout.viewBox !== lastViewBox) {
    setLastViewBox(layout.viewBox);
    setVb(baseVB);
  }

  // ---- Pan / zoom plumbing (all on the container div so touches anywhere —
  // including empty background — pan the map instead of scrolling the page) ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);
  const moved = useRef(false);
  const downNode = useRef<{ char: string } | null>(null);

  const zoomAt = useCallback((factor: number, clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setVb(([x, y, w, h]) => {
      const fx = (clientX - rect.left) / rect.width;
      const fy = (clientY - rect.top) / rect.height;
      const sx = x + fx * w;
      const sy = y + fy * h;
      const baseW = baseVB[2];
      let nw = w / factor;
      nw = clamp(nw, baseW * MIN_ZOOM, baseW * MAX_ZOOM);
      const nh = nw * (h / w);
      return [sx - fx * nw, sy - fy * nh, nw, nh];
    });
    // Zoom limits are relative to the current neighborhood's fit box, so this has
    // to be rebuilt when that changes — otherwise recentering leaves you clamping
    // against the previous graph's dimensions.
  }, [baseVB]);

  const panBy = useCallback((dxPx: number, dyPx: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setVb(([x, y, w, h]) => [x - (dxPx * w) / rect.width, y - (dyPx * h) / rect.height, w, h]);
  }, []);

  // Non-passive wheel listener so we can preventDefault the page scroll/zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // deltaMode 1 = lines (mouse wheel) vs 0 = pixels (touchpad); normalize so
      // a touchpad two-finger zoom feels as responsive as a mouse wheel.
      const step = e.deltaMode === 1 ? e.deltaY * 12 : e.deltaY;
      zoomAt(Math.exp(-step * 0.0035), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    // remember if the gesture started on a clickable node (for tap-to-select)
    const nodeEl = (e.target as Element).closest?.("[data-char]") as HTMLElement | null;
    downNode.current =
      nodeEl && nodeEl.dataset.clickable === "1"
        ? { char: nodeEl.dataset.char! }
        : null;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0) {
        zoomAt(dist / pinchDist.current, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      pinchDist.current = dist;
      moved.current = true;
    } else if (pointers.current.size === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
      panBy(dx, dy);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = 0;
    // a tap (no drag) on a clickable node recenters
    if (!moved.current && pointers.current.size === 0 && downNode.current) {
      onSelect(downNode.current.char);
    }
    downNode.current = null;
  };

  const zoomButton = (factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const statusClass = (char: string): string => {
    const s: KanjiStatus = progress[char] ?? "new";
    return `status-${s}`;
  };

  return (
    <div
      className="kanji-graph"
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg
        className="kanji-graph-svg"
        viewBox={vb.join(" ")}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Connection map centered on ${center}`}
      >
        {/* re-keyed on each recenter so the scene cross-fades in */}
        <g className="kanji-graph-scene" key={`${mode}-${center}`}>
          {layout.edges.map((edge) => (
            <line
              key={edge.id}
              className={`kanji-graph-edge edge-${edge.kind}`}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
            />
          ))}

          {layout.nodes.map((node) => {
            const r = radiusFor(node);
            const interactive =
              node.kind === "kanji" || (node.kind === "connector" && node.clickable);
            const classes = ["kanji-graph-node", `node-${node.kind}`];
            if (node.kind === "kanji" || node.kind === "center") {
              classes.push(statusClass(node.label));
            }
            if (node.kind === "connector") {
              classes.push(`connector-${node.connectorKind}`);
            }
            if (interactive) classes.push("is-interactive");

            return (
              <g
                key={node.id}
                className={classes.join(" ")}
                transform={`translate(${node.x} ${node.y})`}
                data-char={node.label}
                data-clickable={interactive ? "1" : "0"}
                onKeyDown={(ev) => {
                  if (interactive && (ev.key === "Enter" || ev.key === " ")) {
                    ev.preventDefault();
                    onSelect(node.label);
                  }
                }}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={interactive ? `Center on ${node.label}` : undefined}
              >
                {node.kind === "center" && (
                  <circle className="kanji-graph-focus-ring" r={r + 6} />
                )}
                <circle className="kanji-graph-disc" r={r} />
                <text
                  className="kanji-graph-label"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={
                    node.kind === "center"
                      ? 38
                      : node.kind === "kanji"
                        ? 28
                        : connectorFontSize(node.label)
                  }
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div
        className="kanji-graph-zoom"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={() => zoomButton(1.3)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomButton(1 / 1.3)} aria-label="Zoom out">
          −
        </button>
        <button
          type="button"
          onClick={() => setVb(baseVB)}
          aria-label="Reset view"
          title="Reset view"
        >
          ⤢
        </button>
      </div>

      {!hasNeighbors && (
        <p className="kanji-graph-empty">
          No {mode === "shapes" ? "shape" : "sound"} connections for {center}.
          Try the other mode.
        </p>
      )}
    </div>
  );
}
