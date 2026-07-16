import { useMemo, useState } from "react";
import "../styles/Practice.css";
import type { Vocab } from "../types/vocabType";
import type { PracticeScope, Settings } from "../types/settingsType";
import { isVocabAvailable } from "../lib/vocab";
import { scopeVocab, pickWord, applyReview, isDue } from "../lib/srs";
import {
  japaneseMatches,
  meaningMatches,
  toKanaTyping,
  finalizeKana,
} from "../lib/answer";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { logReview } from "../storage/events";
import { loadSettings, saveSettings } from "../storage/settings";
import { useProgress } from "../context/ProgressContext";
import { useNow } from "../lib/useNow";
import EmptyState from "../components/empty-state/EmptyState";

// "etj" = English -> Japanese, "jte" = Japanese -> English
type Direction = "etj" | "jte";

const keyOf = (v: Vocab) => `${v.word}|${v.reading}`;
const randDir = (): Direction => (Math.random() < 0.5 ? "etj" : "jte");

const SCOPES: { id: PracticeScope; label: string }[] = [
  { id: "smart", label: "Smart" },
  { id: "recent", label: "Recent" },
  { id: "all", label: "All" },
  { id: "new", label: "New" },
];

export default function Practice() {
  const { progress } = useProgress();
  const now = useNow();
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const scope = settings.practiceScope;

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
  const [direction, setDirection] = useState<Direction>(randDir);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [graded, setGraded] = useState(false);

  // Only English → Japanese needs kana; the other direction is answered in
  // English, so with this on the phone can stay on its Latin keyboard for both.
  const romaji = settings.romajiInput && direction === "etj";

  const available = useMemo(
    () => vocab.filter((v) => isVocabAvailable(v, progress)),
    [vocab, progress],
  );
  const caughtUp =
    scope === "smart" &&
    available.length > 0 &&
    !available.some((v) => isDue(v, now));

  // Move to the next word, picked from the latest vocab + current scope.
  const advance = (source: Vocab[]) => {
    const pool = scopeVocab(
      source.filter((v) => isVocabAvailable(v, progress)),
      scope,
      now,
    );
    setCurrent(pickWord(pool, scope, current ? keyOf(current) : undefined));
    setDirection(randDir());
    setAnswer("");
    setFeedback(null);
    setRevealed(false);
    setShowContext(false);
    setGraded(false);
  };

  const changeScope = (next: PracticeScope) => {
    const updated = { ...settings, practiceScope: next };
    setSettings(updated);
    saveSettings(updated);
    const pool = scopeVocab(available, next, now);
    setCurrent(pickWord(pool, next, current ? keyOf(current) : undefined));
    setDirection(randDir());
    setAnswer("");
    setFeedback(null);
    setRevealed(false);
    setShowContext(false);
    setGraded(false);
  };

  // Grade the current word once (updates its SRS box + persists). Returns the
  // updated vocab list so callers can advance from it.
  const grade = (correct: boolean): Vocab[] => {
    if (!current) return vocab;
    const srs = applyReview(current.srs, correct, Date.now());
    const next = vocab.map((v) => (keyOf(v) === keyOf(current) ? { ...v, srs } : v));
    setVocab(next);
    saveUserVocab(next);
    logReview(current.word, correct);
    setCurrent({ ...current, srs });
    setGraded(true);
    return next;
  };

  const handleSubmit = () => {
    if (!current) return;
    // An empty submit is a mis-tap, not a miss — grading it would knock the word
    // back to box 0 with no way to undo.
    const raw = answer.trim();
    if (!raw) return;

    // Resolve any trailing romaji consonant left by IME-mode typing ("にほn").
    const guess = romaji ? finalizeKana(raw) : raw;
    const correct =
      direction === "etj"
        ? japaneseMatches(guess, current.word, current.reading)
        : meaningMatches(guess, current.meanings);

    if (correct) {
      const next = graded ? vocab : grade(true);
      setFeedback("correct");
      setRevealed(false);
      setTimeout(() => advance(next), 700);
    } else {
      if (!graded) grade(false);
      setAnswer(guess); // show the finalized kana alongside "try again"
      setFeedback("wrong");
    }
  };

  // Revealing the answer counts as a miss (you couldn't recall it).
  const handleReveal = () => {
    if (!graded) grade(false);
    setRevealed(true);
    setFeedback(null);
  };

  const handleSkip = () => advance(vocab);

  if (vocab.length === 0) {
    return (
      <div className="page page-center">
        <EmptyState
          title="No vocabulary yet"
          message="Practice uses your own word list. Add or import words to start practising."
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
          title="Nothing available yet"
          message="A word becomes practiceable once all of its kanji are marked Learning or Known. Mark some kanji to unlock your words."
          actions={[
            { to: "/kanji", label: "Browse kanji" },
            { to: "/words", label: "My words" },
          ]}
        />
      ) : !current ? (
        <EmptyState
          title={scope === "recent" ? "No recent words" : "No new words"}
          message={
            scope === "recent"
              ? "You haven't added words recently. Switch scope, or add new words."
              : "You've practised everything at least once. Switch scope to keep reviewing."
          }
          actions={[{ to: "/words", label: "My words" }]}
        />
      ) : (
        <>
          {caughtUp && (
            <p className="practice-caughtup">✓ All caught up — extra practice</p>
          )}

          <div className="practice-question-container">
            <strong>
              {direction === "etj"
                ? "Translate to Japanese: "
                : "Translate to English: "}
            </strong>
            {direction === "jte"
              ? `${current.word} (${current.reading})`
              : current.meanings.join(", ")}
          </div>

          <div className="practice-answer-container">
            <textarea
              value={answer}
              onChange={(e) => {
                const raw = e.target.value;
                setAnswer(romaji ? toKanaTyping(raw) : raw);
                if (feedback === "wrong") setFeedback(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              className="practice-answer-input"
              placeholder={
                romaji
                  ? "Type romaji — nihon → にほん"
                  : "Type your answer here"
              }
              // Mobile autocorrect mangles romaji before it can be converted.
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              lang={direction === "etj" && !romaji ? "ja" : undefined}
            />

            <div className="practice-actions">
              <button onClick={handleSubmit} className="practice-submit-button">
                Submit
              </button>
              <button onClick={handleReveal} className="practice-skip-button">
                Show answer
              </button>
              <button onClick={handleSkip} className="practice-skip-button">
                Skip
              </button>
            </div>

            {feedback === "correct" && (
              <p className="practice-feedback correct">✓ Correct!</p>
            )}
            {feedback === "wrong" && (
              <p className="practice-feedback wrong">✗ Not quite — try again</p>
            )}
            {revealed && (
              <p className="practice-reveal">
                Answer:{" "}
                {direction === "etj"
                  ? `${current.word} (${current.reading})`
                  : current.meanings.join(", ")}
              </p>
            )}

            {current.context && (
              <button
                type="button"
                className="practice-context-toggle"
                onClick={() => setShowContext((s) => !s)}
              >
                {showContext ? "Hide context" : "Show context"}
              </button>
            )}
            {showContext && current.context && (
              <p className="practice-context">{current.context}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
