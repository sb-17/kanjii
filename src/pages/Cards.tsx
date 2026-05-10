import { useState } from "react";
import vocab from "../data/vocab.json";
import "../styles/Cards.css";
import type { Vocab } from "../types/vocabType";
import type { Question } from "../types/questionType";
import type { KanjiProgress } from "../types/kanjiProgress";
import { loadKanjiProgress, isKnownOrLearning } from "../storage/kanjiProgress";

export default function Cards() {
  const [progress] = useState<KanjiProgress>(loadKanjiProgress());
  const [isFlipped, setIsFlipped] = useState<boolean>(false);

  const vocabData = vocab as Vocab[];

  // Filter vocab
  const vocabQuestions = vocabData
    .filter((v) => v.kanji.every((k) => isKnownOrLearning(progress[k])))
    .map((v) => {
      return {
        jp: v.word,
        en: v.meanings,
        reading: v.reading,
      };
    });

  const [question, setQuestion] = useState<Question>(() => {
    let max = vocabQuestions.length;
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
      <div className="card-panel">
        <p className="no-vocab-message">No vocabulary cards available.</p>
      </div>
    );
  }

  return (
    <div className="card-panel">
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