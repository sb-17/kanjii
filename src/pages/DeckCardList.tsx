import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../styles/Decks.css";
import type { DeckCard } from "../types/deckType";
import { getDeck, updateDeck } from "../storage/decks";
import EmptyState from "../components/empty-state/EmptyState";

// A deck can hold thousands of cards, and rendering all of them at once janks
// badly on a phone. Search narrows the list; this caps what's drawn otherwise.
const PAGE = 60;

const FIELDS: { key: keyof Omit<DeckCard, "id">; label: string }[] = [
  { key: "word", label: "Word" },
  { key: "reading", label: "Reading" },
  { key: "meaning", label: "Meaning" },
  { key: "example", label: "Example sentence" },
  { key: "exampleEn", label: "Example translation" },
];

export default function DeckCardList() {
  const { deckId = "" } = useParams();
  const deck = getDeck(deckId);

  const [cards, setCards] = useState<DeckCard[]>(deck?.cards ?? []);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.word.toLowerCase().includes(q) ||
        c.meaning.toLowerCase().includes(q) ||
        (c.reading ?? "").toLowerCase().includes(q),
    );
  }, [cards, query]);

  if (!deck) {
    return (
      <div className="page page-center">
        <EmptyState
          title="Deck not found"
          message="This deck isn't on this device."
          actions={[{ to: "/cards", label: "Back to decks" }]}
        />
      </div>
    );
  }

  const persist = (next: DeckCard[]) => {
    setCards(next);
    updateDeck({ ...deck, cards: next });
  };

  // Edits keep the card's id. It was derived from the word and meaning at import,
  // but re-deriving it on every keystroke would detach the review history the
  // card has earned — fixing a typo must not cost you your progress.
  const edit = (id: string, key: keyof Omit<DeckCard, "id">, value: string) => {
    persist(
      cards.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c };
        if (value.trim()) next[key] = value;
        else if (key === "word" || key === "meaning") next[key] = value;
        else delete next[key];
        return next;
      }),
    );
  };

  const removeCard = (card: DeckCard) => {
    if (!confirm(`Remove "${card.word}" from this deck?`)) return;
    persist(cards.filter((c) => c.id !== card.id));
    setOpenId(null);
  };

  return (
    <div className="page">
      <div className="deck-player-head">
        <Link className="deck-back" to={`/cards/${deck.id}/settings`}>
          ← {deck.name}
        </Link>
        <span className="deck-player-name">Cards</span>
      </div>

      <label className="deck-field">
        <input
          type="search"
          placeholder="Search word, reading or meaning"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
        />
      </label>

      <p className="settings-description">
        {matches.length === cards.length
          ? `${cards.length} cards`
          : `${matches.length} of ${cards.length} cards`}
      </p>

      <div className="deck-card-list">
        {matches.slice(0, shown).map((card) => (
          <div key={card.id} className="deck-card-row surface-card">
            <button
              className="deck-card-summary"
              onClick={() => setOpenId(openId === card.id ? null : card.id)}
            >
              <span className="deck-card-word" lang="ja">{card.word}</span>
              <span className="deck-card-meaning">{card.meaning}</span>
            </button>

            {openId === card.id && (
              <div className="deck-card-edit">
                {FIELDS.map((field) => (
                  <label key={field.key} className="deck-field">
                    <span>{field.label}</span>
                    <input
                      type="text"
                      value={card[field.key] ?? ""}
                      onChange={(e) => edit(card.id, field.key, e.target.value)}
                    />
                  </label>
                ))}
                <button
                  className="settings-button deck-danger"
                  onClick={() => removeCard(card)}
                >
                  <strong>🗑 Remove card</strong>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {shown < matches.length && (
        <div className="settings-actions">
          <button
            className="settings-button"
            onClick={() => setShown(shown + PAGE)}
          >
            <strong>Show more ({matches.length - shown} left)</strong>
          </button>
        </div>
      )}
    </div>
  );
}
