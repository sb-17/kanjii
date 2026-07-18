import { useMemo, useState } from "react";
import "../styles/Cards.css";
import type { Vocab } from "../types/vocabType";
import type { PracticeScope, Settings } from "../types/settingsType";
import { isVocabAvailable } from "../lib/vocab";
import { scopeVocab, pickWord, gradeDirection } from "../lib/srs";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { logReview } from "../storage/events";
import { loadSettings, saveSettings } from "../storage/settings";
import { useProgress } from "../context/ProgressContext";
import { useNow } from "../lib/useNow";
import EmptyState from "../components/empty-state/EmptyState";

const SCOPES: { id: PracticeScope; label: string }[] = [
  { id: "smart", label: "Smart" },
  { id: "recent", label: "Recent" },
  { id: "all", label: "All" },
  { id: "new", label: "New" },
];

const keyOf = (v: Vocab) => `${v.word}|${v.reading}`;

export default function Cards() {
  const { progress } = useProgress();
  const now = useNow();
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const scope = settings.practiceScope;
  const [isFlipped, setIsFlipped] = useState<boolean>(false);

  const [vocab, setVocab] = useState<Vocab[]>(loadUserVocab);
  const [current, setCurrent] = useState<Vocab | null>(() =>
    pickWord(
      scopeVocab(
        loadUserVocab().filter((v) => isVocabAvailable(v, progress)),
        scope,
        Date.now(),
      ),
      scope,
    ),
  );

  const available = useMemo(
    () => vocab.filter((v) => isVocabAvailable(v, progress)),
    [vocab, progress],
  );

  // Move to the next card, picked from the latest vocab + current scope. Flips
  // back first, then swaps the word once it's face-down (so the answer doesn't
  // flash on the way out).
  const advance = (source: Vocab[]) => {
    const pool = scopeVocab(
      source.filter((v) => isVocabAvailable(v, progress)),
      scope,
      now,
    );
    setIsFlipped(false);
    setTimeout(() => {
      setCurrent(pickWord(pool, scope, current ? keyOf(current) : undefined));
    }, 150);
  };

  const changeScope = (next: PracticeScope) => {
    const updated = { ...settings, practiceScope: next };
    setSettings(updated);
    saveSettings(updated);
    setIsFlipped(false);
    const pool = scopeVocab(available, next, now);
    setCurrent(pickWord(pool, next, current ? keyOf(current) : undefined));
  };

  // A card shows English and you recall the Japanese — the E→J (production)
  // direction. Grading feeds the same Leitner box Practice does, so Smart scope
  // now actually clears reviewed cards instead of showing them forever.
  const grade = (correct: boolean) => {
    if (!current) return;
    const srs = gradeDirection(current, "etj", correct, Date.now());
    const next = vocab.map((v) => (keyOf(v) === keyOf(current) ? { ...v, srs } : v));
    setVocab(next);
    saveUserVocab(next);
    logReview(current.word, correct);
    advance(next);
  };

  const handleFlip = () => setIsFlipped((f) => !f);

  if (vocab.length === 0) {
    return (
      <div className="page page-center">
        <EmptyState
          title="No vocabulary yet"
          message="Cards come from your own word list. Add or import words to start building your deck."
          actions={[{ to: "/words", label: "Add words" }]}
        />
      </div>
    );
  }

  return (
    <div className="page page-center">
      <div className="scope-tabs">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            className={`scope-tab${scope === s.id ? " active" : ""}`}
            onClick={() => changeScope(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {available.length === 0 ? (
        <EmptyState
          title="No cards to review yet"
          message="A word becomes a card once all of its kanji are marked Learning or Known. Mark some kanji to unlock your words."
          actions={[
            { to: "/kanji", label: "Browse kanji" },
            { to: "/words", label: "My words" },
          ]}
        />
      ) : !current ? (
        <EmptyState
          title={scope === "recent" ? "No recent words" : "No new words"}
          message="Switch scope to keep reviewing, or add more words."
          actions={[{ to: "/words", label: "My words" }]}
        />
      ) : (
        <>
          <div
            className={`flashcard-container ${isFlipped ? "flipped" : ""}`}
            onClick={handleFlip}
          >
            <div className="flashcard-inner">
              <div className="flashcard-front">
                <span className="card-label">English</span>
                <p className="card-text">{current.meanings.join(", ")}</p>
                <span className="tap-hint">Tap to flip</span>
              </div>

              <div className="flashcard-back">
                <span className="card-label">Japanese</span>
                <h1 className="japanese-word">{current.word}</h1>
                <p className="japanese-reading">（{current.reading}）</p>
                {current.context && (
                  <p className="card-context">{current.context}</p>
                )}
                <span className="tap-hint">Tap to flip back</span>
              </div>
            </div>
          </div>

          <div className="card-actions">
            {isFlipped ? (
              <>
                <button
                  className="card-grade card-grade-again"
                  onClick={() => grade(false)}
                >
                  Again
                </button>
                <button
                  className="card-grade card-grade-got"
                  onClick={() => grade(true)}
                >
                  Got it
                </button>
              </>
            ) : (
              <button className="practice-submit-button" onClick={handleFlip}>
                Show answer
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
