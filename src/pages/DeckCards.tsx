import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../styles/Cards.css";
import "../styles/Decks.css";
import type { DeckCard, DeckScope } from "../types/deckType";
import { getDeck } from "../storage/decks";
import { deckBoxes, setCardBox } from "../storage/deckProgress";
import { recordDeckReview } from "../storage/deckStats";
import { loadSettings, saveSettings } from "../storage/settings";
import { deckCounts, pickDeckCard } from "../lib/deckSrs";
import { applyReview } from "../lib/srs";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { extractKanji } from "../lib/vocab";
import { useNow } from "../lib/useNow";
import EmptyState from "../components/empty-state/EmptyState";
import Flashcard from "../components/flashcard/Flashcard";
import CardActions from "../components/flashcard/CardActions";

const wordKey = (word: string, reading: string) => `${word}|${reading}`;

const SCOPES: { id: DeckScope; label: string }[] = [
  { id: "due", label: "Due" },
  { id: "new", label: "New" },
  { id: "random", label: "Random" },
  { id: "all", label: "All" },
];

export default function DeckCards() {
  const { deckId = "" } = useParams();
  const now = useNow();
  const deck = getDeck(deckId);

  const [boxes, setBoxes] = useState(() => deckBoxes(deckId));
  const [scope, setScope] = useState<DeckScope>(() => loadSettings().deckScope);
  const [isFlipped, setIsFlipped] = useState(false);
  const [current, setCurrent] = useState<DeckCard | null>(() =>
    deck
      ? pickDeckCard(
          deck.cards,
          deckBoxes(deckId),
          loadSettings().deckScope,
          Date.now(),
        )
      : null,
  );
  // "added" | "duplicate" for the card on screen; cleared whenever the card
  // changes so the confirmation can't linger onto the next one.
  const [addState, setAddState] = useState<"added" | "duplicate" | null>(null);

  // Same reason as the My Words player: the flip-back pause must not outlive the
  // component, or grading and navigating away inside the window swaps the card on
  // a page that's gone.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  if (!deck) {
    return (
      <div className="page page-center">
        <EmptyState
          title="Deck not found"
          message="This deck isn't on this device. Deck content isn't part of the backup, so after restoring you need to import the file again — your progress is waiting for it."
          actions={[{ to: "/cards", label: "Back to decks" }]}
        />
      </div>
    );
  }

  const counts = deckCounts(deck.cards, boxes, now);

  const grade = (correct: boolean) => {
    if (!current) return;
    const box = applyReview(boxes[current.id], correct, Date.now());
    const next = { ...boxes, [current.id]: box };
    setBoxes(next);
    setCardBox(deck.id, current.id, box);
    recordDeckReview(deck.id, correct);

    setIsFlipped(false);
    setAddState(null);
    timersRef.current.push(
      setTimeout(() => {
        setCurrent(pickDeckCard(deck.cards, next, scope, Date.now(), current.id));
      }, 150),
    );
  };

  const changeScope = (next: DeckScope) => {
    setScope(next);
    saveSettings({ ...loadSettings(), deckScope: next });
    setIsFlipped(false);
    setAddState(null);
    // Re-pick immediately rather than waiting for the next answer, so the tab
    // visibly does something. `current.id` is passed so switching mode doesn't
    // hand back the card already on screen when the new scope still contains it.
    // `now` from useNow rather than Date.now(), matching the My Words player.
    // A due date a minute stale can't change which card is offered.
    setCurrent(pickDeckCard(deck.cards, boxes, next, now, current?.id));
  };

  // Copy the card into My Words so it joins the kanji-aware side of the app —
  // Practice, availability, the word detail page. The deck keeps its own card and
  // its own schedule; this is a copy, not a move.
  const addToMyWords = () => {
    if (!current) return;
    const reading = current.reading ?? "";
    const list = loadUserVocab();
    if (list.some((v) => wordKey(v.word, v.reading) === wordKey(current.word, reading))) {
      setAddState("duplicate");
      return;
    }
    saveUserVocab([
      ...list,
      {
        word: current.word,
        reading,
        meanings: [current.meaning],
        kanji: extractKanji(current.word),
        // The deck's example sentence lands in `context`, which is exactly what
        // that field is for — so the sentence follows the word into Practice
        // rather than being left behind in the deck.
        ...(current.example ? { context: current.example } : {}),
        addedAt: Date.now(),
      },
    ]);
    setAddState("added");
  };

  return (
    <div className="page page-center">
      <div className="deck-player-head">
        <Link className="deck-back" to="/cards">
          ← Decks
        </Link>
        <span className="deck-player-name">{deck.name}</span>
        <span className="deck-player-counts">
          {counts.due} due · {counts.fresh} new
        </span>
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

      {!current ? (
        <EmptyState
          title={
            counts.total === 0
              ? "This deck has no cards"
              : scope === "new"
                ? "No new cards left"
                : "Nothing due right now"
          }
          message={
            counts.total === 0
              ? "Import the deck file again to add cards."
              : scope === "new"
                ? "Every card in this deck has been studied at least once. Switch to Due to review them, or Random to shuffle."
                : "Every card is scheduled for later. Switch to Random or All to keep going."
          }
          actions={[{ to: "/cards", label: "Back to decks" }]}
        />
      ) : (
        <>
          <Flashcard
            flipped={isFlipped}
            onFlip={() => setIsFlipped((f) => !f)}
            front={
              <>
                <span className="card-label">English</span>
                <p className="card-text">{current.meaning}</p>
                {current.exampleEn && (
                  <p className="card-example">{current.exampleEn}</p>
                )}
              </>
            }
            back={
              <>
                <span className="card-label">Japanese</span>
                <h1 className="japanese-word">{current.word}</h1>
                {current.reading && (
                  <p className="japanese-reading">（{current.reading}）</p>
                )}
                {current.example && (
                  <p className="card-example">{current.example}</p>
                )}
                {deck.japanese && (
                  <button
                    className="card-word-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      addToMyWords();
                    }}
                  >
                    {addState === "added"
                      ? "✓ Added to My words"
                      : addState === "duplicate"
                        ? "Already in My words"
                        : "+ Add to My words"}
                  </button>
                )}
              </>
            }
          />

          <CardActions
            flipped={isFlipped}
            onShow={() => setIsFlipped(true)}
            onGrade={grade}
          />
        </>
      )}
    </div>
  );
}
