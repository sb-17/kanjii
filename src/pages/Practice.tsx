import { useState } from "react";
import kanji from "../data/kanji.json";
import vocab from "../data/vocab.json";
import "../styles/Practice.css";
import type { Kanji } from "../types/kanjiType";
import type { Vocab } from "../types/vocabType";
import type { Question } from "../types/questionType";
import type { KanjiProgress, KanjiStatus } from "../types/kanjiProgress";
import { loadKanjiProgress } from "../storage/kanjiProgress";

function isKnownOrLearning(status: KanjiStatus | undefined) {
  return status === "known" || status === "learning";
}

export default function Practice() {
  const [progress] = useState<KanjiProgress>(loadKanjiProgress());
  const [answer, setAnswer] = useState<string>("");

  const probabilities = [0, 0.5, 0.5];

  const kanjiData = kanji as Kanji[];
  const vocabData = vocab as Vocab[];

  // filter kanji and vocab
  const kanjiQuestions = kanjiData
    .filter((k) => {
      const status: KanjiStatus = progress[k.character] || "new";
      return status === "learning" || status === "known";
    })
    .map((k) => {
      return {
        jp: k.character,
        en: k.meanings,
      };
    });

  const vocabQuestions = vocabData
    .filter((v) => v.kanji.every((k) => isKnownOrLearning(progress[k])))
    .map((v) => {
      return {
        jp: v.word,
        en: v.meanings,
      };
    });

  const [questionType, setQuestionType] = useState<
    "kanji" | "vocab etj" | "vocab jte"
  >(() => {
    const rand = Math.random();
    if (rand < probabilities[0]) return "kanji";
    else if (rand < probabilities[0] + probabilities[1]) return "vocab etj";
    else return "vocab jte";
  });

  const [question, setQuestion] = useState<Question>(() => {
    let max = 0;
    if (questionType === "kanji") max = kanjiQuestions.length;
    else max = vocabQuestions.length;

    const randIndex = Math.floor(Math.random() * max);

    if (vocabQuestions.length > 0 && questionType === "kanji") {
      return kanjiQuestions[randIndex];
    } else {
      return vocabQuestions[randIndex];
    }
  });

  const handleNextQuestion = () => {
    const rand = Math.random();

    if (rand < probabilities[0]) setQuestionType("kanji");
    else if (rand < probabilities[0] + probabilities[1])
      setQuestionType("vocab etj");
    else setQuestionType("vocab jte");

    let max = 0;
    if (questionType === "kanji") max = kanjiQuestions.length;
    else max = vocabQuestions.length;

    const randIndex = Math.floor(Math.random() * max);
    if (vocabQuestions.length > 0 && questionType === "kanji") {
      setQuestion(kanjiQuestions[randIndex]);
    } else {
      setQuestion(vocabQuestions[randIndex]);
    }
  };

  const handleSubmit = () => {
    if (vocabQuestions.length > 0) {
      if (questionType === "vocab etj") {
        if (answer.toLowerCase() === question.jp.toLowerCase()) {
          handleNextQuestion();
          setAnswer("");
        }
      } else if (questionType === "vocab jte") {
        if (
          question.en.some(
            (meaning) => meaning.toLowerCase() === answer.toLowerCase(),
          )
        ) {
          handleNextQuestion();
          setAnswer("");
        }
      }
    }
  };

  return (
    <div className="practice-panel">
      <div className="practice-question-container">
        <strong>
          {questionType === "kanji"
            ? "Draw the kanji for: "
            : questionType === "vocab etj"
              ? "Translate to Japanese: "
              : "Translate to English: "}
        </strong>
        {vocabQuestions.length > 0
          ? questionType === "vocab jte"
            ? question.jp
            : question.en.join(", ")
          : "No vocabulary available for practice."}
      </div>

      <div className="practice-answer-container">
        {vocabQuestions.length > 0 ? (
          questionType === "vocab etj" || questionType === "vocab jte" ? (
            <>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                className="practice-answer-input"
                placeholder="Type your answer here"
              />
              <button onClick={handleSubmit} className="practice-submit-button">
                Submit
              </button>
              <button
                onClick={handleNextQuestion}
                className="practice-skip-button"
              >
                Skip
              </button>
            </>
          ) : (
            <div className="practice-drawing-area">
              {/* Drawing area for kanji practice can be implemented here */}
              <em>Drawing area coming soon!</em>
            </div>
          )
        ) : (
          ""
        )}
      </div>
    </div>
  );
}
