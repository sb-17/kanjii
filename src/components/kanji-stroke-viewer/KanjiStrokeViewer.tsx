import { useEffect, useState } from "react";
import "./KanjiStrokeViewer.css";
import { loadKanjiStrokes, strokeStartPoint } from "../../lib/kanjiVg";

type KanjiStrokeViewerProps = {
  kanji: string;
};

export default function KanjiStrokeViewer({ kanji }: KanjiStrokeViewerProps) {
  const [frames, setFrames] = useState<string[][]>([]);

  useEffect(() => {
    let active = true;
    loadKanjiStrokes(kanji).then((paths) => {
      if (!active) return;
      setFrames(paths.map((_, i) => paths.slice(0, i + 1)));
    });
    return () => {
      active = false;
    };
  }, [kanji]);

  return (
    <div className="kanji-stroke-section">
      <strong>Stroke order</strong>

      <div className="kanji-stroke-container">
        {frames.map((frame, i) => (
          <svg
            key={i}
            className="kanji-frame"
            viewBox="0 0 110 110"
            style={{ width: "100px", height: "auto" }}
          >
            <line
              x1="0"
              y1="55"
              x2="110"
              y2="55"
              stroke="var(--border)"
              strokeWidth={1}
            />
            <line
              x1="55"
              y1="0"
              x2="55"
              y2="110"
              stroke="var(--border)"
              strokeWidth={1}
            />

            {frame.map((d, j) => {
              const isLast = j === frame.length - 1;
              const start = strokeStartPoint(d);

              return (
                <g key={j}>
                  <path d={d} stroke="currentColor" strokeWidth={3} fill="none" />
                  {isLast && start && (
                    <circle cx={start.x} cy={start.y} r={4} fill="var(--accent)" />
                  )}
                </g>
              );
            })}
          </svg>
        ))}
      </div>
    </div>
  );
}
