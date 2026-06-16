import { useState, useMemo } from "react";
import "../styles/Cards.css";
import type { Question } from "../types/questionType";
import { isVocabAvailable } from "../lib/vocab";
import { loadUserVocab } from "../storage/userVocab";
import { useProgress } from "../context/ProgressContext";
import EmptyState from "../components/empty-state/EmptyState";

export default function Cards() {
  const { progress } = useProgress();
  const [isFlipped, setIsFlipped] = useState<boolean>(false);

  const userVocab = loadUserVocab();

  // Available vocab depends only on progress — memoized so flipping a card
  // (which re-renders) doesn't re-filter the whole vocab list each time.
  const vocabQuestions = useMemo(
    () =>
      userVocab
        .filter((v) => isVocabAvailable(v, progress))
        .map((v) => ({
          jp: v.word,
          en: v.meanings,
          reading: v.reading,
          context: v.context,
        })),
    [progress, userVocab],
  );

  const [question, setQuestion] = useState<Question>(() => {
    const max = vocabQuestions.length;
    const randIndex = Math.floor(Math.random() * max);
    return vocabQuestions[randIndex];
  });

  const handleNextQuestion = () => {
    setIsFlipped(false);

    setTimeout(() => {
      // Pick a different card than the current one (when more than one exists).
      setQuestion((current) => {
        if (vocabQuestions.length <= 1) return vocabQuestions[0];
        let next = current;
        while (!next || next.jp === current?.jp) {
          next = vocabQuestions[Math.floor(Math.random() * vocabQuestions.length)];
        }
        return next;
      });
    }, 150);
  };

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  if (!question) {
    return (
      <div className="page page-center">
        {userVocab.length === 0 ? (
          <EmptyState
            title="No vocabulary yet"
            message="Cards come from your own word list. Add or import words to start building your deck."
            actions={[{ to: "/words", label: "Add words" }]}
          />
        ) : (
          <EmptyState
            title="No cards to review yet"
            message="A word becomes a card once all of its kanji are marked Learning or Known. Mark some kanji to unlock your words."
            actions={[
              { to: "/kanji", label: "Browse kanji" },
              { to: "/words", label: "My words" },
            ]}
          />
        )}
      </div>
    );
  }

  return (
    <div className="page page-center">
      <div className={`flashcard-container ${isFlipped ? "flipped" : ""}`} onClick={handleFlip}>
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
    </div>
  );
}