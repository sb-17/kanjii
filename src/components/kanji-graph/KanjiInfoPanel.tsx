import { Link } from "react-router-dom";
import kanjiData from "../../data/kanji.json";
import type { Kanji } from "../../types/kanjiType";
import type { KanjiStatus } from "../../types/kanjiProgress";
import { useProgress } from "../../context/ProgressContext";
import KanjiStrokeViewer from "../kanji-stroke-viewer/KanjiStrokeViewer";

const byChar = new Map((kanjiData as Kanji[]).map((k) => [k.character, k]));

type Props = {
  char: string;
  onClose: () => void;
};

export default function KanjiInfoPanel({ char, onClose }: Props) {
  const { progress, setStatus } = useProgress();
  const k = byChar.get(char);
  const status: KanjiStatus = progress[char] ?? "new";

  return (
    <div className="map-panel-inner">
      <div className="map-panel-head">
        <span className="map-panel-title">Kanji details</span>
        <button
          type="button"
          className="map-panel-close"
          onClick={onClose}
          aria-label="Close details"
        >
          ✕
        </button>
      </div>

      {!k ? (
        <p className="map-panel-empty">No data for this character.</p>
      ) : (
        <div className="map-panel-body">
          <div className="map-panel-glyph">{k.character}</div>
          <div className="map-panel-meanings">{k.meanings.join(", ")}</div>

          <div className="map-panel-readings">
            {k.on.length > 0 && (
              <div>
                <strong>On:</strong> {k.on.join(", ")}
              </div>
            )}
            {k.kun.length > 0 && (
              <div>
                <strong>Kun:</strong> {k.kun.join(", ")}
              </div>
            )}
            <div>
              <strong>Strokes:</strong> {k.strokes}
              {"   "}
              <strong>Freq:</strong> {k.frequency ?? "—"}
            </div>
          </div>

          <select
            className="map-panel-status"
            value={status}
            onChange={(e) => setStatus(char, e.target.value as KanjiStatus)}
            aria-label="Kanji status"
          >
            <option value="new">🆕 New</option>
            <option value="learning">🔁 Learning</option>
            <option value="known">✅ Known</option>
          </select>

          <div className="map-panel-strokes">
            <KanjiStrokeViewer kanji={k.character} />
          </div>

          <div className="map-panel-actions">
            <Link className="map-panel-link" to={`/kanji/${encodeURIComponent(char)}`}>
              Open full page →
            </Link>
            <Link
              className="map-panel-link"
              to={`/kanji/${encodeURIComponent(char)}/write`}
            >
              ✏️ Practice writing
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
