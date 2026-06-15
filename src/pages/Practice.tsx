import { useState, useMemo } from "react";
import vocab from "../data/vocab.json";
import "../styles/Practice.css";
import type { Vocab } from "../types/vocabType";
import type { Question } from "../types/questionType";
import { isVocabAvailable } from "../lib/vocab";
import { useProgress } from "../context/ProgressContext";
import EmptyState from "../components/empty-state/EmptyState";

// "etj" = English -> Japanese, "jte" = Japanese -> English
type Direction = "etj" | "jte";

export default function Practice() {
  const { progress } = useProgress();
  const [answer, setAnswer] = useState<string>("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [revealed, setRevealed] = useState<boolean>(false);

  // Available vocab depends only on progress — memoized so typing an answer
  // (which re-renders every keystroke) doesn't re-filter the whole list.
  const vocabQuestions = useMemo(
    () =>
      (vocab as Vocab[])
        .filter((v) => isVocabAvailable(v, progress))
        .map((v) => ({ jp: v.word, en: v.meanings, reading: v.reading })),
    [progress],
  );

  const pickDirection = (): Direction => (Math.random() < 0.5 ? "etj" : "jte");
  const pickQuestion = (): Question =>
    vocabQuestions[Math.floor(Math.random() * vocabQuestions.length)];

  const [direction, setDirection] = useState<Direction>(() => pickDirection());
  const [question, setQuestion] = useState<Question | null>(() =>
    vocabQuestions.length > 0 ? pickQuestion() : null,
  );

  const handleNext = () => {
    setDirection(pickDirection());
    setQuestion(vocabQuestions.length > 0 ? pickQuestion() : null);
    setAnswer("");
    setFeedback(null);
    setRevealed(false);
  };

  const handleSubmit = () => {
    if (!question) return;
    const guess = answer.trim().toLowerCase();
    const correct =
      direction === "etj"
        ? guess === question.jp.toLowerCase()
        : question.en.some((meaning) => meaning.toLowerCase() === guess);

    if (correct) {
      setFeedback("correct");
      setRevealed(false);
      setTimeout(handleNext, 700);
    } else {
      setFeedback("wrong");
    }
  };

  const handleReveal = () => {
    setRevealed(true);
    setFeedback(null);
  };

  if (vocabQuestions.length === 0 || !question) {
    return (
      <div className="page page-center">
        <EmptyState
          title="Nothing to practice yet"
          message="Vocabulary practice uses words whose kanji are all marked Learning or Known. Mark some kanji to unlock words to practise."
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
      <div className="practice-question-container">
        <strong>
          {direction === "etj"
            ? "Translate to Japanese: "
            : "Translate to English: "}
        </strong>
        {direction === "jte"
          ? `${question.jp} (${question.reading})`
          : question.en.join(", ")}
      </div>

      <div className="practice-answer-container">
        <textarea
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
            if (feedback) setFeedback(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          className="practice-answer-input"
          placeholder="Type your answer here"
        />

        <div className="practice-actions">
          <button onClick={handleSubmit} className="practice-submit-button">
            Submit
          </button>
          <button onClick={handleReveal} className="practice-skip-button">
            Show answer
          </button>
          <button onClick={handleNext} className="practice-skip-button">
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
              ? `${question.jp} (${question.reading})`
              : question.en.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
