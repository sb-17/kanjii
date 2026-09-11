import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import "../styles/WordDetail.css";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { getKanji } from "../lib/kanjiIndex";
import { MAX_BOX } from "../lib/srs";
import { useProgress } from "../context/ProgressContext";
import type { KanjiStatus } from "../types/kanjiProgress";
import type { SrsBox } from "../types/vocabType";
import EmptyState from "../components/empty-state/EmptyState";

const keyOf = (word: string, reading: string) => `${word}|${reading}`;

// Coarse on purpose, like Settings' backup age: the question is "is this coming
// back soon?", never which minute.
function describeDue(due: number): string {
  const mins = Math.round((due - Date.now()) / 60000);
  if (mins <= 0) return "due now";
  if (mins < 60) return `due in ${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `due in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `due in ${days} day${days === 1 ? "" : "s"}`;
}

function describeBox(box: SrsBox | undefined): string {
  if (!box) return "Not practised yet";
  return `Box ${box.box} of ${MAX_BOX} · ${describeDue(box.due)}`;
}

export default function WordDetail() {
  const navigate = useNavigate();
  const { key } = useParams<{ key: string }>();
  const { progress } = useProgress();
  const decoded = key ? decodeURIComponent(key) : "";
  const word = useMemo(
    () => loadUserVocab().find((v) => keyOf(v.word, v.reading) === decoded),
    [decoded],
  );
  const [favorite, setFavorite] = useState(!!word?.favorite);

  // Writes straight through the storage cache rather than through any list held
  // here: this page renders one word, and My words re-reads the cache on mount.
  const toggleFavorite = () => {
    const next = !favorite;
    setFavorite(next);
    saveUserVocab(
      loadUserVocab().map((v) =>
        keyOf(v.word, v.reading) === decoded
          ? { ...v, favorite: next || undefined }
          : v,
      ),
    );
  };

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

  // A sentence only has a box once it can be practised at all — it needs the
  // translation to grade yourself against (lib/sentenceSrs `hasSentence`), so
  // without one there is no row to show.
  const reviews: { label: string; box?: SrsBox }[] = [
    { label: "English → Japanese", box: word.srs?.etj },
    { label: "Japanese → English", box: word.srs?.jte },
    ...(word.example && word.exampleEn
      ? [{ label: "Sentence", box: word.sentenceSrs }]
      : []),
  ];

  return (
    <div className="page">
      <button type="button" className="word-back" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <div className="word-header">
        <h1 className="word-title" lang="ja">{word.word}</h1>
        {word.reading && <div className="word-reading" lang="ja">{word.reading}</div>}
        <div className="word-meanings">{word.meanings.join(", ")}</div>
        {word.example && <p className="word-example" lang="ja">{word.example}</p>}
        {word.exampleEn && <p className="word-example-en">{word.exampleEn}</p>}
        {word.context && <p className="word-note">{word.context}</p>}
      </div>

      <div className="word-actions">
        <button
          type="button"
          className={`word-action${favorite ? " active" : ""}`}
          onClick={toggleFavorite}
          aria-pressed={favorite}
        >
          {favorite ? "★ Favourite" : "☆ Favourite"}
        </button>
        {/* The edit form lives on My words; this opens it there with the word
            loaded, rather than giving this page a second copy of it. */}
        <button
          type="button"
          className="word-action"
          onClick={() => navigate("/words", { state: { editKey: decoded } })}
        >
          Edit
        </button>
      </div>

      <h2 className="word-section-title">Review progress</h2>
      <div className="word-srs">
        {reviews.map((r) => (
          <div className="word-srs-row" key={r.label}>
            <span className="word-srs-label">{r.label}</span>
            <span className="word-srs-state">{describeBox(r.box)}</span>
          </div>
        ))}
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
                <span className="word-kanji-char" lang="ja">{ch}</span>
                <span className="word-kanji-info">
                  <span className="word-kanji-meaning">
                    {k ? k.meanings.join(", ") : "—"}
                  </span>
                  {readings.length > 0 && (
                    <span className="word-kanji-readings" lang="ja">
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
