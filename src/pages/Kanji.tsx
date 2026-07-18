import { useParams, Link } from "react-router-dom";
import "../styles/Kanji.css";
import type { KanjiStatus } from "../types/kanjiProgress";
import { isVocabAvailable, knownRatio } from "../lib/vocab";
import { loadUserVocab } from "../storage/userVocab";
import { getKanji } from "../lib/kanjiIndex";
import { getNeighborhood, type Connector } from "../lib/kanjiGraph";
import { useProgress } from "../context/ProgressContext";
import KanjiStrokeViewer from "../components/kanji-stroke-viewer/KanjiStrokeViewer";

export default function Kanji() {
  const { char } = useParams<{ char: string }>();
  const { progress, setStatus } = useProgress();

  // load kanji data
  const kanjiObj = getKanji(char ?? "");

  if (!kanjiObj) {
    return <div>Kanji not found</div>;
  }

  const status: KanjiStatus = progress[kanjiObj.character] || "new";

  const updateStatus = (newStatus: KanjiStatus) => {
    setStatus(kanjiObj.character, newStatus);
  };

  // the learner's own vocab that uses this kanji
  const filteredVocab = loadUserVocab()
    .filter((v) => v.kanji.includes(kanjiObj.character))
    .sort((a, b) => a.kanji.length - b.kanji.length);

  const fullyKnownVocab = filteredVocab.filter((v) =>
    isVocabAvailable(v, progress),
  );

  const mostlyKnownVocab = filteredVocab.filter((v) => {
    const ratio = knownRatio(v, progress);
    return ratio >= 0.5 && ratio < 1;
  });

  const renderVocabList = (items: typeof filteredVocab, emptyMessage: string) =>
    items.length === 0 ? (
      <p className="kanji-vocab-empty">{emptyMessage}</p>
    ) : (
      items.map((v, i) => (
        <div className="kanji-vocab-item" key={`${v.word}-${i}`}>
          <span className="kanji-vocab-word">{v.word}</span>
          <span className="kanji-vocab-reading">{v.reading}</span>
          <span className="kanji-vocab-meaning">{v.meanings.join(", ")}</span>
        </div>
      ))
    );

  // Related kanji from the connection graph: those that share this one's on-yomi
  // (Same reading) or a component/phonetic (Similar shape). Already grouped by the
  // shared element, frequency-sorted and capped. Cheap: the graph caches results.
  const soundLinks = getNeighborhood(kanjiObj.character, "sounds").connectors;
  const shapeLinks = getNeighborhood(kanjiObj.character, "shapes").connectors;

  // One labelled block ("Same reading" / "Similar shape"): a row per shared
  // element, with each neighbour a chip tinted by your status for it.
  const renderConnectorBlock = (title: string, connectors: Connector[]) =>
    connectors.length > 0 && (
      <div className="kanji-related-block">
        <span className="kanji-related-kind">{title}</span>
        {connectors.map((c) => (
          <div className="kanji-related-row" key={`${title}-${c.el}`}>
            <span className="kanji-related-label">{c.el}</span>
            <div className="kanji-related-chips">
              {c.kanji.map((ch) => (
                <Link
                  key={ch}
                  to={`/kanji/${encodeURIComponent(ch)}`}
                  className={`kanji-related-chip status-${progress[ch] || "new"}`}
                  title={getKanji(ch)?.meanings.join(", ")}
                >
                  {ch}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <div className="page kanji-page">
      <div className="kanji-top">
        <div className="kanji-char">{kanjiObj.character}</div>

        <div className="kanji-info">
          <div className="kanji-meanings">{kanjiObj.meanings.join(", ")}</div>

          <div className="kanji-readings-frequency-strokes">
            {kanjiObj.kun.length > 0 && (
              <div>
                <strong>Kunyomi:</strong> {kanjiObj.kun.join(", ")}
              </div>
            )}
            {kanjiObj.on.length > 0 && (
              <div>
                <strong>Onyomi:</strong> {kanjiObj.on.join(", ")}
              </div>
            )}
            <div>
              <strong>Frequency:</strong> {kanjiObj.frequency ?? "—"}
              {"  "}
              <strong>Strokes:</strong> {kanjiObj.strokes}
            </div>
          </div>
        </div>

        <div className="kanji-controls">
          <label className="kanji-status-label" htmlFor="kanji-status-select">
            Status
          </label>
          <select
            id="kanji-status-select"
            className="kanji-status-select"
            value={status}
            onChange={(e) => updateStatus(e.target.value as KanjiStatus)}
          >
            <option value="new">🆕 New</option>
            <option value="learning">🔁 Learning</option>
            <option value="known">✅ Known</option>
          </select>
          <Link
            to={`/kanji/${encodeURIComponent(kanjiObj.character)}/write`}
            className="kanji-write-link"
          >
            ✏️ Practice writing
          </Link>
          <Link
            to={`/map?focus=${encodeURIComponent(kanjiObj.character)}`}
            className="kanji-write-link"
          >
            🕸 Connections
          </Link>
        </div>
      </div>

      <div className="kanji-strokes">
        <KanjiStrokeViewer kanji={kanjiObj.character} />
      </div>

      <div className="kanji-vocab-section">
        <div className="kanji-vocab-column">
          <strong className="kanji-vocab-heading">
            Words you can read ({fullyKnownVocab.length})
          </strong>
          {renderVocabList(
            fullyKnownVocab,
            "No words here yet — add words with this kanji in My words.",
          )}
        </div>

        <div className="kanji-vocab-column">
          <strong className="kanji-vocab-heading">
            Words with some new kanji ({mostlyKnownVocab.length})
          </strong>
          {renderVocabList(
            mostlyKnownVocab,
            "No close matches right now.",
          )}
        </div>
      </div>

      {(soundLinks.length > 0 || shapeLinks.length > 0) && (
        <div className="kanji-related">
          <strong className="kanji-related-heading">Related kanji</strong>
          {renderConnectorBlock("Same reading", soundLinks)}
          {renderConnectorBlock("Similar shape", shapeLinks)}
        </div>
      )}
    </div>
  );
}
