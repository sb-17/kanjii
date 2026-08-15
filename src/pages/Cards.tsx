import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/Cards.css";
import "../styles/Decks.css";
import type { Vocab } from "../types/vocabType";
import type { PracticeScope, Settings } from "../types/settingsType";
import { isVocabAvailable } from "../lib/vocab";
import { scopeVocab, pickWord, gradeDirection } from "../lib/srs";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { logReview, loadEvents } from "../storage/events";
import { newWordsIntroducedToday } from "../lib/analytics";
import { loadSettings, saveSettings } from "../storage/settings";
import { useProgress } from "../context/ProgressContext";
import { useNow } from "../lib/useNow";
import EmptyState from "../components/empty-state/EmptyState";
import Flashcard from "../components/flashcard/Flashcard";
import CardActions from "../components/flashcard/CardActions";

// "smart" id kept (stored setting); label shows "Due" to match writing practice.
const SCOPES: { id: PracticeScope; label: string }[] = [
  { id: "smart", label: "Due" },
  { id: "recent", label: "Recent" },
  { id: "all", label: "All" },
  { id: "new", label: "New" },
];

const keyOf = (v: Vocab) => `${v.word}|${v.reading}`;

// New words still allowed today — shared budget with Practice, since both grade
// into the same boxes and log the same events.
const remainingNewToday = (perDay: number) =>
  Math.max(0, perDay - newWordsIntroducedToday(loadEvents()));

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
        remainingNewToday(loadSettings().newPerDay),
      ),
      scope,
      undefined,
      Date.now(),
    ),
  );

  const available = useMemo(
    () => vocab.filter((v) => isVocabAvailable(v, progress)),
    [vocab, progress],
  );

  // The word just graded, kept only to go on being drawn on the *back* face while
  // the flip-back plays.
  //
  // Swapping both faces at once leaked the next answer: the flip runs 600ms and
  // the card is still at 137° after 150ms, so the back is square-on to you when
  // the new word lands. Timing the swap for the 90° crossing is no good either —
  // the window where neither face is readable is barely 40ms wide, narrower than
  // a dropped frame. Instead the front takes the new word immediately (it's
  // hidden for the first half of the turn) while the back keeps showing the
  // answer you just graded until it has turned away.
  const [gradedBack, setGradedBack] = useState<Vocab | null>(null);

  // Move to the next card, picked from the latest vocab + current scope.
  const advance = (source: Vocab[]) => {
    const pool = scopeVocab(
      source.filter((v) => isVocabAvailable(v, progress)),
      scope,
      now,
      remainingNewToday(settings.newPerDay),
    );
    setGradedBack(current);
    setIsFlipped(false);
    setCurrent(pickWord(pool, scope, current ? keyOf(current) : undefined, now));
  };

  const changeScope = (next: PracticeScope) => {
    const updated = { ...settings, practiceScope: next };
    setSettings(updated);
    saveSettings(updated);
    setGradedBack(current);
    setIsFlipped(false);
    const pool = scopeVocab(
      available,
      next,
      now,
      remainingNewToday(updated.newPerDay),
    );
    setCurrent(
      pickWord(pool, next, current ? keyOf(current) : undefined, now),
    );
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

  // Flipping to the answer releases the held-back card: the front is face-on for
  // the first half of *that* turn, so swapping the hidden back face is equally
  // invisible then.
  const handleFlip = () => {
    if (!isFlipped) setGradedBack(null);
    setIsFlipped((f) => !f);
  };

  // The back face lags the front by one card while a flip-back is playing.
  const backCard = gradedBack ?? current;

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
      <div className="deck-player-head">
        <Link className="deck-back" to="/cards">
          ← Decks
        </Link>
        <span className="deck-player-name">My words</span>
      </div>

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
          <Flashcard
            flipped={isFlipped}
            onFlip={handleFlip}
            front={
              <>
                <span className="card-label">English</span>
                <p className="card-text">{current.meanings.join(", ")}</p>
              </>
            }
            back={
              backCard && (
                <>
                  <span className="card-label">Japanese</span>
                  <h1 className="japanese-word">{backCard.word}</h1>
                  <p className="japanese-reading">（{backCard.reading}）</p>
                  {backCard.context && (
                    <p className="card-context">{backCard.context}</p>
                  )}
                  <Link
                    className="card-word-link"
                    to={`/word/${encodeURIComponent(keyOf(backCard))}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    View word →
                  </Link>
                </>
              )
            }
          />

          <CardActions
            flipped={isFlipped}
            onShow={handleFlip}
            onGrade={grade}
          />
        </>
      )}
    </div>
  );
}
