import { useState } from "react";
import { Link } from "react-router-dom";
import kanji from "../data/kanji.json";
import vocab from "../data/vocab.json";
import "../styles/Practice.css";
import type { Kanji } from "../types/kanjiType";
import type { Vocab } from "../types/vocabType";
import type { Question } from "../types/questionType";
import type { KanjiProgress, KanjiStatus } from "../types/kanjiProgress";
import { loadKanjiProgress, isKnownOrLearning } from "../storage/kanjiProgress";
import { loadSettings } from "../storage/settings";
import type { Settings } from "../types/settingsType";
import EmptyState from "../components/empty-state/EmptyState";

type QuestionType = "kanji known" | "kanji learning" | "vocab etj" | "vocab jte";

const QUESTION_TYPES: QuestionType[] = [
  "kanji known",
  "kanji learning",
  "vocab etj",
  "vocab jte",
];

export default function Practice() {
  const [progress] = useState<KanjiProgress>(loadKanjiProgress());
  const [answer, setAnswer] = useState<string>("");
  const [answerKanji, setAnswerKanji] = useState<string>("");
  const [settings] = useState<Settings>(loadSettings());

  var count = 0;
  if (settings.kanjiKnown) count++;
  if (settings.kanjiLearning) count++;
  if (settings.vocab) count += 2;

  const probabilities = [0, 0, 0, 0] as number[];
  if (settings.kanjiKnown) probabilities[0] = 1 / count;
  if (settings.kanjiLearning) probabilities[1] = 1 / count;
  if (settings.vocab) {
    probabilities[2] = 1 / count;
    probabilities[3] = 1 / count;
  }

  const kanjiData = kanji as Kanji[];
  const vocabData = vocab as Vocab[];

  // filter kanji and vocab
  const kanjiQuestions = kanjiData
    .filter((k) => {
      const status: KanjiStatus = progress[k.character] || "new";
      if (settings.kanjiKnown && settings.kanjiLearning) return status === "learning" || status === "known";
      if (settings.kanjiKnown) return status === "known";
      if (settings.kanjiLearning) return status === "learning";
      return false;
    })
    .map((k) => {
      return {
        jp: k.character,
        en: k.meanings,
        reading: "",
      };
    });

  const vocabQuestions = vocabData
    .filter((v) => v.kanji.every((k) => isKnownOrLearning(progress[k])))
    .map((v) => {
      return {
        jp: v.word,
        en: v.meanings,
        reading: v.reading,
      };
    });

  const poolFor = (type: QuestionType) =>
    type === "kanji known" || type === "kanji learning" ? kanjiQuestions : vocabQuestions;

  // a question type is only available if it's enabled in settings and its pool has questions
  const availableTypes = QUESTION_TYPES.filter(
    (type, i) => probabilities[i] > 0 && poolFor(type).length > 0,
  );

  const hasContent = availableTypes.length > 0;

  const pickQuestionType = (): QuestionType | null => {
    if (availableTypes.length === 0) return null;

    const totalWeight = availableTypes.reduce(
      (sum, type) => sum + probabilities[QUESTION_TYPES.indexOf(type)],
      0,
    );

    let rand = Math.random() * totalWeight;
    for (const type of availableTypes) {
      const weight = probabilities[QUESTION_TYPES.indexOf(type)];
      if (rand < weight) return type;
      rand -= weight;
    }

    return availableTypes[availableTypes.length - 1];
  };

  const pickQuestion = (type: QuestionType): Question => {
    const pool = poolFor(type);
    const randIndex = Math.floor(Math.random() * pool.length);
    return pool[randIndex];
  };

  const [questionType, setQuestionType] = useState<QuestionType | null>(() => pickQuestionType());
  const [question, setQuestion] = useState<Question | null>(() =>
    questionType ? pickQuestion(questionType) : null,
  );

  const handleNextQuestion = () => {
    const nextType = pickQuestionType();
    setQuestionType(nextType);
    setQuestion(nextType ? pickQuestion(nextType) : null);
    setAnswerKanji("");
  };

  const handleSubmit = () => {
    if (!question) return;

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
    setAnswerKanji("");
  };

  const handleShow = () => {
    if (question && (questionType === "kanji known" || questionType === "kanji learning")) {
      setAnswerKanji(question.jp);
    }
  };

  if (!hasContent || !questionType || !question) {
    return (
      <div className="page page-center">
        <EmptyState
          title="Nothing to practice yet"
          message="Practice questions come from kanji marked Learning or Known, and from vocabulary whose kanji are all marked Learning or Known. Mark some kanji to get started, or check your practice settings."
          actions={[
            { to: "/kanji-list", label: "Browse kanji" },
            { to: "/learn", label: "Browse by set" },
            { to: "/settings", label: "Practice settings" },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="page page-center">
      <div className="practice-question-container">
        <strong>
          {(questionType === "kanji known" || questionType === "kanji learning")
            ? "Draw the kanji for: "
            : questionType === "vocab etj"
              ? "Translate to Japanese: "
              : "Translate to English: "}
        </strong>
        {questionType === "vocab jte"
          ? question.jp + " (" + question.reading + ")"
          : question.en.join(", ")}
      </div>

      <div className="practice-answer-container">
        {questionType === "vocab etj" || questionType === "vocab jte" ? (
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

            <div className="practice-actions">
              <button onClick={handleSubmit} className="practice-submit-button">
                Submit
              </button>
              <button
                onClick={handleNextQuestion}
                className="practice-skip-button"
              >
                Skip
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="practice-actions">
              <button onClick={handleShow} className="practice-skip-button">
                Show
              </button>
              <button onClick={handleNextQuestion} className="practice-skip-button">
                Next
              </button>
            </div>
            {answerKanji && (
              <Link to={`/kanji/${answerKanji}`} className="kanji-answer-link">
                {answerKanji}
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
