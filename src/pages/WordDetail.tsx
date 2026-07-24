import { useParams, Link } from "react-router-dom";
import "../styles/WordDetail.css";
import { loadUserVocab } from "../storage/userVocab";
import { getKanji } from "../lib/kanjiIndex";
import { useProgress } from "../context/ProgressContext";
import type { KanjiStatus } from "../types/kanjiProgress";
import EmptyState from "../components/empty-state/EmptyState";

const keyOf = (word: string, reading: string) => `${word}|${reading}`;

export default function WordDetail() {
  const { key } = useParams<{ key: string }>();
  const { progress } = useProgress();
  const decoded = key ? decodeURIComponent(key) : "";
  const word = loadUserVocab().find((v) => keyOf(v.word, v.reading) === decoded);

  if (!word) {
    return (
      <div className="page page-center">
        <EmptyState
          title="Word not found"
          message="This word isn't in your list — it may have been edited or removed."
          actions={[{ to: "/words", label: "My words" }]}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="word-header">
        <h1 className="word-title">{word.word}</h1>
        {word.reading && <div className="word-reading">{word.reading}</div>}
        <div className="word-meanings">{word.meanings.join(", ")}</div>
        {word.context && <p className="word-note">{word.context}</p>}
      </div>

      <h2 className="word-section-title">Kanji in this word</h2>
      {word.kanji.length === 0 ? (
        <p className="word-empty">
          This word is written in kana — no kanji to break down.
        </p>
      ) : (
        <div className="word-kanji-list">
          {word.kanji.map((ch) => {
            const k = getKanji(ch);
            const status: KanjiStatus = progress[ch] || "new";
            const readings = k ? [...k.kun, ...k.on].slice(0, 4) : [];
            return (
              <Link
                key={ch}
                to={`/kanji/${encodeURIComponent(ch)}`}
                className={`word-kanji-row status-${status}`}
              >
                <span className="word-kanji-char">{ch}</span>
                <span className="word-kanji-info">
                  <span className="word-kanji-meaning">
                    {k ? k.meanings.join(", ") : "—"}
                  </span>
                  {readings.length > 0 && (
                    <span className="word-kanji-readings">
                      {readings.join("、")}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
