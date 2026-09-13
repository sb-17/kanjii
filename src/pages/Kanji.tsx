import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import "../styles/Kanji.css";
import type { KanjiStatus } from "../types/kanjiProgress";
import { isVocabAvailable, knownRatio } from "../lib/vocab";
import { loadUserVocab } from "../storage/userVocab";
import { getKanji } from "../lib/kanjiIndex";
import { getNeighborhood, type Connector } from "../lib/kanjiGraph";
import { unlockedByTagging } from "../lib/analytics";
import { useProgress } from "../context/ProgressContext";
import KanjiStrokeViewer from "../components/kanji-stroke-viewer/KanjiStrokeViewer";
import EmptyState from "../components/empty-state/EmptyState";
import WordSuggestions from "../components/word-suggestions/WordSuggestions";

export default function Kanji() {
  const { char } = useParams<{ char: string }>();
  const { progress, setStatus } = useProgress();
  const navigate = useNavigate();
  const [suggestOpen, setSuggestOpen] = useState(false);
  // The word lists below read the store during render, so adding a word only
  // needs something to re-render on.
  const [, setVocabVersion] = useState(0);

  // load kanji data
  const kanjiObj = getKanji(char ?? "");

  // Reached more often than a typo'd URL would suggest: `extractKanji` takes any
  // CJK ideograph out of a word, without checking it against the dataset, so a
  // word like 味噌 or 綺麗 produces a kanji chip in My words and Read that links
  // here. ~40% of the kanji in the reader's dictionary are outside kanji.json.
  // Whether those should be links at all is a separate question; this at least
  // makes the landing honest instead of a bare unstyled line of text.
  if (!kanjiObj) {
    return (
      <div className="page page-center">
        <EmptyState
          title="Kanji not found"
          message="Kanjii's data covers the 2,136 jōyō kanji. This character isn't one of them, so there's nothing to show for it — you can still use it inside your own words."
          actions={[
            { to: "/kanji", label: "All kanji" },
            { to: "/", label: "Home" },
          ]}
        />
      </div>
    );
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

  // What tagging this kanji actually buys: the locked words it would release on
  // its own. The two lists below say what you can already read; this is the one
  // that answers "why bother with this character", and it's the reason to pick
  // it over a more frequent one that unlocks nothing of yours.
  const wouldUnlock =
    status === "new" ? unlockedByTagging(kanjiObj.character, loadUserVocab(), progress) : 0;

  const renderVocabList = (items: typeof filteredVocab, emptyMessage: string) =>
    items.length === 0 ? (
      <p className="kanji-vocab-empty">{emptyMessage}</p>
    ) : (
      items.map((v, i) => (
        <Link
          className="kanji-vocab-item"
          key={`${v.word}-${i}`}
          to={`/word/${encodeURIComponent(`${v.word}|${v.reading}`)}`}
        >
          <span className="kanji-vocab-word" lang="ja">{v.word}</span>
          <span className="kanji-vocab-reading" lang="ja">{v.reading}</span>
          <span className="kanji-vocab-meaning">{v.meanings.join(", ")}</span>
        </Link>
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
                  lang="ja"
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
      <button
        type="button"
        className="kanji-back"
        onClick={() => navigate(-1)}
      >
        ← Back
      </button>

      <div className="kanji-top">
        <div className="kanji-char" lang="ja">{kanjiObj.character}</div>

        <div className="kanji-info">
          <div className="kanji-meanings">{kanjiObj.meanings.join(", ")}</div>

          <div className="kanji-readings-frequency-strokes">
            {/* The label is English and the readings are Japanese, so `lang`
                goes on the value rather than the row. */}
            {kanjiObj.kun.length > 0 && (
              <div>
                <strong>Kunyomi:</strong>{" "}
                <span lang="ja">{kanjiObj.kun.join(", ")}</span>
              </div>
            )}
            {kanjiObj.on.length > 0 && (
              <div>
                <strong>Onyomi:</strong>{" "}
                <span lang="ja">{kanjiObj.on.join(", ")}</span>
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
            <option value="mastered">🟪 Mastered</option>
          </select>
          {wouldUnlock > 0 && (
            <p className="kanji-unlock-note">
              🔓 Marking this unlocks {wouldUnlock}{" "}
              {wouldUnlock === 1 ? "word" : "words"} in your list
            </p>
          )}
          <Link
            to={`/kanji/${encodeURIComponent(kanjiObj.character)}/learn`}
            className="kanji-write-link"
          >
            📖 Learn this kanji
          </Link>
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
            "No words here yet — pick one below, or add your own in My words.",
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

      {/* Words to add, from the bundled dictionary. Behind a toggle rather than
          open by default: it fetches ~424 KB, and most visits to this page are
          to read or tag, not to build vocabulary. */}
      <div className="kanji-suggest">
        {suggestOpen ? (
          <>
            <strong className="kanji-vocab-heading">Add a word with this kanji</strong>
            <WordSuggestions
              char={kanjiObj.character}
              onAdd={() => setVocabVersion((v) => v + 1)}
            />
          </>
        ) : (
          <button
            type="button"
            className="kanji-suggest-toggle"
            onClick={() => setSuggestOpen(true)}
          >
            ＋ Add a word with this kanji
          </button>
        )}
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
