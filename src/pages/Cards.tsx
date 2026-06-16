import { useMemo, useState } from "react";
import "../styles/Cards.css";
import type { Question } from "../types/questionType";
import type { PracticeScope, Settings } from "../types/settingsType";
import { isVocabAvailable } from "../lib/vocab";
import { scopeVocab } from "../lib/srs";
import { loadUserVocab } from "../storage/userVocab";
import { loadSettings, saveSettings } from "../storage/settings";
import { useProgress } from "../context/ProgressContext";
import EmptyState from "../components/empty-state/EmptyState";

const SCOPES: { id: PracticeScope; label: string }[] = [
  { id: "smart", label: "Smart" },
  { id: "recent", label: "Recent" },
  { id: "all", label: "All" },
  { id: "new", label: "New" },
];

const toQuestion = (v: {
  word: string;
  meanings: string[];
  reading: string;
  context?: string;
}): Question => ({
  jp: v.word,
  en: v.meanings,
  reading: v.reading,
  context: v.context,
});

const pickQuestion = (pool: Question[], exceptJp?: string): Question | undefined => {
  if (pool.length === 0) return undefined;
  let candidates = pool;
  if (pool.length > 1 && exceptJp) {
    const filtered = pool.filter((q) => q.jp !== exceptJp);
    if (filtered.length > 0) candidates = filtered;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
};

export default function Cards() {
  const { progress } = useProgress();
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const scope = settings.practiceScope;
  const [isFlipped, setIsFlipped] = useState<boolean>(false);

  const userVocab = loadUserVocab();

  const available = useMemo(
    () => userVocab.filter((v) => isVocabAvailable(v, progress)),
    [progress, userVocab],
  );
  const pool = useMemo(
    () => scopeVocab(available, scope, Date.now()).map(toQuestion),
    [available, scope],
  );

  const [question, setQuestion] = useState<Question | undefined>(() => {
    const init = scopeVocab(
      loadUserVocab().filter((v) => isVocabAvailable(v, progress)),
      scope,
      Date.now(),
    ).map(toQuestion);
    return pickQuestion(init);
  });

  const handleNextQuestion = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setQuestion((current) => pickQuestion(pool, current?.jp));
    }, 150);
  };

  const changeScope = (next: PracticeScope) => {
    const updated = { ...settings, practiceScope: next };
    setSettings(updated);
    saveSettings(updated);
    setIsFlipped(false);
    const nextPool = scopeVocab(available, next, Date.now()).map(toQuestion);
    setQuestion(pickQuestion(nextPool, question?.jp));
  };

  const handleFlip = () => setIsFlipped((f) => !f);

  if (userVocab.length === 0) {
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
      ) : !question ? (
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
                <p className="card-text">
                  {Array.isArray(question.en) ? question.en.join(", ") : question.en}
                </p>
                <span className="tap-hint">Tap to flip</span>
              </div>

              <div className="flashcard-back">
                <span className="card-label">Japanese</span>
                <h1 className="japanese-word">{question.jp}</h1>
                <p className="japanese-reading">（{question.reading}）</p>
                {question.context && (
                  <p className="card-context">{question.context}</p>
                )}
                <span className="tap-hint">Tap to flip back</span>
              </div>
            </div>
          </div>

          <div className="card-actions">
            <button className="practice-submit-button" onClick={handleNextQuestion}>
              Next Card
            </button>
          </div>
        </>
      )}
    </div>
  );
}
