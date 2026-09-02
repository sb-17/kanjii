import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/Practice.css";
import type { Vocab } from "../types/vocabType";
import type { PracticeScope, Settings } from "../types/settingsType";
import { isVocabAvailable } from "../lib/vocab";
import {
  scopeVocab,
  pickWord,
  applyReview,
  gradeDirection,
  pickDirection,
  isDue,
  isNew,
} from "../lib/srs";
import { pickSentence, preferSentence, sentencePool } from "../lib/sentenceSrs";
import { vocabLadder } from "../lib/schedule";
import {
  japaneseMatches,
  meaningMatches,
  toKanaTyping,
  finalizeKana,
} from "../lib/answer";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { logReview, loadEvents } from "../storage/events";
import { newWordAllowance } from "../lib/analytics";
import { loadSettings, saveSettings } from "../storage/settings";
import { useProgress } from "../context/ProgressContext";
import { useNow } from "../lib/useNow";
import EmptyState from "../components/empty-state/EmptyState";
import ClearableField from "../components/clearable-field/ClearableField";

// "etj" = English -> Japanese, "jte" = Japanese -> English
type Direction = "etj" | "jte";

// What's on screen. A "sentence" item is the word blanked out of its own example
// sentence; it grades the word's `sentenceSrs` box and leaves both directions
// alone (and vice versa), so `dir` only means anything in "word" mode.
type Item = { v: Vocab; mode: "word" | "sentence"; dir: Direction };

const keyOf = (v: Vocab) => `${v.word}|${v.reading}`;

// New words still allowed today. Read live from the event cache rather than held
// in state: each new word graded consumes one, and the pool is recomputed on
// every advance, so the allowance has to be current at that moment.
// New words allowed into the pool right now. Paced against reviews *answered*
// rather than the size of the queue, so a backlog can't push introductions past
// the end of the session — see analytics `newWordAllowance`.
const remainingNewToday = (perDay: number, list: Vocab[], now: number) =>
  newWordAllowance(
    loadEvents(),
    perDay,
    list.some((v) => !isNew(v) && isDue(v, now)),
    now,
  );

// The next thing to study, drawn from two queues: words (unchanged) and example
// sentences. Both are built from the same available list and the same scope;
// which one wins is `preferSentence`. `list` is already availability-filtered.
const nextItem = (
  list: Vocab[],
  scope: PracticeScope,
  settings: Settings,
  now: number,
  exceptKey?: string,
): Item | null => {
  const pool = scopeVocab(
    list,
    scope,
    now,
    remainingNewToday(settings.newPerDay, list, now),
  );
  const word = pickWord(pool, scope, exceptKey, now);

  const sPool = settings.practiceSentences ? sentencePool(list, scope, now) : [];
  const sentence = pickSentence(sPool, scope, exceptKey);
  if (
    sentence &&
    preferSentence(word, sentence, scope, now, {
      words: pool.length,
      sentences: sPool.length,
    })
  ) {
    return { v: sentence, mode: "sentence", dir: "etj" };
  }
  return word ? { v: word, mode: "word", dir: pickDirection(word, now) } : null;
};

// The "smart" id is kept (it's the stored setting value); only the label changed
// to "Due" to line up with writing practice. It still falls back to extra cards
// when you're caught up — see the "all caught up" banner.
const SCOPES: { id: PracticeScope; label: string }[] = [
  { id: "smart", label: "Due" },
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
  const [item, setItem] = useState<Item | null>(() =>
    nextItem(
      loadUserVocab().filter((v) => isVocabAvailable(v, progress)),
      scope,
      loadSettings(),
      Date.now(),
    ),
  );
  const current = item?.v ?? null;
  const direction = item?.dir ?? "etj";
  const mode = item?.mode ?? "word";
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [graded, setGraded] = useState(false);

  // The pause before auto-advancing must not outlive the component — answering
  // correctly and navigating away inside the window would otherwise advance a
  // page that's gone. Same guard KanjiWriter uses for its "Correct!" beat.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // A sentence item is self-graded against the translation you wrote, so it has
  // no typed answer at all — see lib/sentenceSrs.
  const isSentence = mode === "sentence";

  // Only English → Japanese needs kana; the other direction is answered in
  // English, so with this on the phone can stay on its Latin keyboard for both.
  const romaji = settings.romajiInput && direction === "etj";

  const available = useMemo(
    () => vocab.filter((v) => isVocabAvailable(v, progress)),
    [vocab, progress],
  );
  // Caught up = no review is due *and* today's new-word allowance is spent (or
  // there's nothing new left) *and* no sentence is waiting either. Anything after
  // that is extra practice.
  const caughtUp =
    scope === "smart" &&
    available.length > 0 &&
    !available.some((v) => !isNew(v) && isDue(v, now)) &&
    (remainingNewToday(settings.newPerDay, available, now) <= 0 ||
      !available.some(isNew)) &&
    (!settings.practiceSentences ||
      sentencePool(available, "smart", now).length === 0);

  // Move to the next item, picked from the latest vocab + current scope.
  const availableIn = (list: Vocab[]) =>
    list.filter((v) => isVocabAvailable(v, progress));

  const resetAnswer = () => {
    setAnswer("");
    setFeedback(null);
    setRevealed(false);
    setShowNote(false);
    setGraded(false);
  };

  const advance = (source: Vocab[]) => {
    setItem(
      nextItem(
        availableIn(source),
        scope,
        settings,
        now,
        current ? keyOf(current) : undefined,
      ),
    );
    resetAnswer();
  };

  const changeScope = (next: PracticeScope) => {
    const updated = { ...settings, practiceScope: next };
    setSettings(updated);
    saveSettings(updated);
    setItem(
      nextItem(
        available,
        next,
        updated,
        now,
        current ? keyOf(current) : undefined,
      ),
    );
    resetAnswer();
  };

  // Grade the current item once (updates its SRS box + persists). Returns the
  // updated vocab list so callers can advance from it.
  const grade = (correct: boolean): Vocab[] => {
    if (!current) return vocab;
    const at = Date.now();
    const ladder = vocabLadder();
    const patch: Partial<Vocab> = isSentence
      ? { sentenceSrs: applyReview(current.sentenceSrs, correct, at, ladder) }
      : { srs: gradeDirection(current, direction, correct, at, ladder) };
    const next = vocab.map((v) =>
      keyOf(v) === keyOf(current) ? { ...v, ...patch } : v,
    );
    setVocab(next);
    saveUserVocab(next);
    // Word reviews only. A sentence answer logged here is indistinguishable from
    // the word's first-ever review, and `newWordsIntroducedToday` reads that as
    // introducing a new word — spending the daily allowance on a word already
    // being reviewed. Deck reviews stay out of the log for the same reason.
    if (!isSentence) logReview(current.word, current.reading, correct);
    setItem((it) => (it ? { ...it, v: { ...it.v, ...patch } } : it));
    setGraded(true);
    return next;
  };

  const handleSubmit = () => {
    if (!current) return;
    // A correct answer schedules the advance 700ms out and leaves the text in the
    // box until it fires. Submitting again inside that window used to re-grade the
    // same correct answer and queue a *second* advance, so the word after this one
    // was skipped without ever being shown. The buttons are disabled during the
    // pause too; this covers the Enter key, which isn't.
    if (feedback === "correct") return;

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
      later(() => advance(next), 700);
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

  // A sentence item grades itself: you compare your translation with the one you
  // wrote for the word and say which it was. No auto-advance pause — there's no
  // feedback to read, since you already know how it went.
  const handleSelfGrade = (correct: boolean) => advance(grade(correct));

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

          {isSentence ? (
            <div className="practice-question-container practice-sentence">
              <strong>Translate this sentence: </strong>
              <span lang="ja">{current.example}</span>
            </div>
          ) : (
            <div className="practice-question-container">
              <strong>
                {direction === "etj"
                  ? "Translate to Japanese: "
                  : "Translate to English: "}
              </strong>
              {/* J→E shows the word, E→J shows the English meaning — so only the
                  first branch carries Japanese. */}
              {direction === "jte" ? (
                <span lang="ja">{`${current.word} (${current.reading})`}</span>
              ) : (
                current.meanings.join(", ")
              )}
            </div>
          )}

          {current.context && (
            <div className="practice-note-line">
              <button
                type="button"
                className="practice-note-toggle"
                onClick={() => setShowNote((s) => !s)}
              >
                {showNote ? "Hide note" : "Show note"}
              </button>
              {showNote && <span className="practice-note">{current.context}</span>}
            </div>
          )}

          {isSentence ? (
            <div className="practice-answer-container">
              {revealed ? (
                <>
                  <p className="practice-sentence-translation">
                    {current.exampleEn}
                  </p>
                  {/* You already know how it went, so this is the grade, not a
                      check of one — see lib/sentenceSrs. */}
                  <div className="practice-actions">
                    <button
                      onClick={() => handleSelfGrade(false)}
                      className="practice-skip-button"
                    >
                      Again
                    </button>
                    <button
                      onClick={() => handleSelfGrade(true)}
                      className="practice-submit-button"
                    >
                      Got it
                    </button>
                  </div>
                </>
              ) : (
                <div className="practice-actions">
                  <button onClick={handleSkip} className="practice-skip-button">
                    Skip
                  </button>
                  <button
                    onClick={() => setRevealed(true)}
                    className="practice-submit-button"
                  >
                    Show translation
                  </button>
                </div>
              )}

              <Link
                className="practice-word-link"
                to={`/word/${encodeURIComponent(keyOf(current))}`}
              >
                View word →
              </Link>
            </div>
          ) : (
          <div className="practice-answer-container">
            <ClearableField
              show={answer.length > 0}
              onClear={() => {
                setAnswer("");
                if (feedback === "wrong") setFeedback(null);
              }}
              align="top"
              label="Clear answer"
            >
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
            </ClearableField>

            {/* All three are locked during the correct-answer pause: any of them
                firing while an advance is already queued skips a word. */}
            <div className="practice-actions">
              <button
                onClick={handleSkip}
                className="practice-skip-button"
                disabled={feedback === "correct"}
              >
                Skip
              </button>
              <button
                onClick={handleReveal}
                className="practice-skip-button"
                disabled={feedback === "correct"}
              >
                Show answer
              </button>
              <button
                onClick={handleSubmit}
                className="practice-submit-button"
                disabled={feedback === "correct"}
              >
                Submit
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
            {revealed && (
              <Link
                className="practice-word-link"
                to={`/word/${encodeURIComponent(keyOf(current))}`}
              >
                View word →
              </Link>
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
}
