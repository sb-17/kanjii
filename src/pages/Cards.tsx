import { useState, useMemo } from "react";
import vocab from "../data/vocab.json";
import "../styles/Cards.css";
import type { Vocab } from "../types/vocabType";
import type { Question } from "../types/questionType";
import type { KanjiProgress } from "../types/kanjiProgress";
import { loadKanjiProgress } from "../storage/kanjiProgress";
import { isVocabAvailable } from "../lib/vocab";
import EmptyState from "../components/empty-state/EmptyState";

export default function Cards() {
  const [progress] = useState<KanjiProgress>(loadKanjiProgress());
  const [isFlipped, setIsFlipped] = useState<boolean>(false);

  // Available vocab depends only on progress — memoized so flipping a card
  // (which re-renders) doesn't re-filter the whole vocab list each time.
  const vocabQuestions = useMemo(
    () =>
      (vocab as Vocab[])
        .filter((v) => isVocabAvailable(v, progress))
        .map((v) => ({ jp: v.word, en: v.meanings, reading: v.reading })),
    [progress],
  );

  const [question, setQuestion] = useState<Question>(() => {
    const max = vocabQuestions.length;
    const randIndex = Math.floor(Math.random() * max);
    return vocabQuestions[randIndex];
  });

  const handleNextQuestion = () => {
    setIsFlipped(false);
    
    setTimeout(() => {
      const max = vocabQuestions.length;
      const randIndex = Math.floor(Math.random() * max);
      setQuestion(vocabQuestions[randIndex]);
    }, 150); 
  };

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  if (!question) {
    return (
      <div className="page page-center">
        <EmptyState
          title="No vocabulary to review yet"
          message="Cards are generated from vocabulary whose kanji are all marked Learning or Known. Mark some kanji as Learning or Known to start building your card deck."
          actions={[
            { to: "/kanji-list", label: "Browse kanji" },
            { to: "/learn", label: "Browse by set" },
          ]}
        />
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