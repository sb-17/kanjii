import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../styles/Cards.css";
import "../styles/Decks.css";
import type { DeckCard } from "../types/deckType";
import { getDeck } from "../storage/decks";
import { deckBoxes, setCardBox } from "../storage/deckProgress";
import { deckCounts, pickDeckCard } from "../lib/deckSrs";
import { applyReview } from "../lib/srs";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { extractKanji } from "../lib/vocab";
import { useNow } from "../lib/useNow";
import EmptyState from "../components/empty-state/EmptyState";
import Flashcard from "../components/flashcard/Flashcard";
import CardActions from "../components/flashcard/CardActions";

const wordKey = (word: string, reading: string) => `${word}|${reading}`;

export default function DeckCards() {
  const { deckId = "" } = useParams();
  const now = useNow();
  const deck = getDeck(deckId);

  const [boxes, setBoxes] = useState(() => deckBoxes(deckId));
  const [isFlipped, setIsFlipped] = useState(false);
  const [current, setCurrent] = useState<DeckCard | null>(() =>
    deck ? pickDeckCard(deck.cards, deckBoxes(deckId), Date.now()) : null,
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

    setIsFlipped(false);
    setAddState(null);
    timersRef.current.push(
      setTimeout(() => {
        setCurrent(pickDeckCard(deck.cards, next, Date.now(), current.id));
      }, 150),
    );
  };

  // Copy the card into My Words so it joins the kanji-aware side of the app —
  // Practice, availability, the word detail page. The deck keeps its own card and
  // its own schedule; this is a copy, not a move.
  const addToMyWords = () => {
    if (!current) return;
    const reading = current.reading ?? "";
    const list = loadUserVocab();
    if (list.some((v) => wordKey(v.word, v.reading) === wordKey(current.back, reading))) {
      setAddState("duplicate");
      return;
    }
    saveUserVocab([
      ...list,
      {
        word: current.back,
        reading,
        meanings: [current.front],
        kanji: extractKanji(current.back),
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

      {!current ? (
        <EmptyState
          title="Nothing due right now"
          message={
            counts.total === 0
              ? "This deck has no cards."
              : "Every card in this deck is scheduled for later. Come back when something's due."
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
                <span className="card-label">Front</span>
                <p className="card-text">{current.front}</p>
              </>
            }
            back={
              <>
                <span className="card-label">Back</span>
                <h1 className="japanese-word">{current.back}</h1>
                {current.reading && (
                  <p className="japanese-reading">（{current.reading}）</p>
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
