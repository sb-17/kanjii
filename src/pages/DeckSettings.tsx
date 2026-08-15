import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import "../styles/Decks.css";
import { getDeck, loadDecks, saveDecks, updateDeck } from "../storage/decks";
import { deckBoxes, clearDeckProgress } from "../storage/deckProgress";
import { clearDeckStats, loadDeckStats } from "../storage/deckStats";
import { deckCounts } from "../lib/deckSrs";
import { deckTotals } from "../lib/analytics";
import { useNow } from "../lib/useNow";
import EmptyState from "../components/empty-state/EmptyState";

export default function DeckSettings() {
  const { deckId = "" } = useParams();
  const navigate = useNavigate();
  const now = useNow();
  const deck = getDeck(deckId);
  const [name, setName] = useState(deck?.name ?? "");

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

  const counts = deckCounts(deck.cards, deckBoxes(deck.id), now);
  const studied = deckTotals(loadDeckStats())[deck.id];

  // Renaming keeps the deck's id. The id is derived from the *original* name and
  // is what backed-up progress is filed under, so recomputing it here would
  // orphan every box this deck has earned. The consequence to know: to line a
  // renamed deck up with another device, re-import there under the original name.
  const rename = () => {
    const next = name.trim();
    if (!next || next === deck.name) return;
    updateDeck({ ...deck, name: next });
  };

  const remove = () => {
    if (
      !confirm(
        `Delete "${deck.name}"?\n\n` +
          `${deck.cards.length} cards, their review progress and their study history are removed from this device. This cannot be undone.`,
      )
    ) {
      return;
    }
    saveDecks(loadDecks().filter((d) => d.id !== deck.id));
    clearDeckProgress(deck.id);
    clearDeckStats(deck.id);
    void navigate("/cards");
  };

  return (
    <div className="page">
      <div className="deck-player-head">
        <Link className="deck-back" to="/cards">
          ← Decks
        </Link>
        <span className="deck-player-name">{deck.name}</span>
      </div>

      <div className="settings-card surface-card">
        <strong>Deck</strong>

        <p className="settings-description">
          {deck.cards.length} cards · {counts.due} due · {counts.fresh} new
          {studied ? ` · ${studied.n} answered all time` : ""}
        </p>

        <label className="deck-field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
          />
        </label>
      </div>

      <div className="settings-card surface-card">
        <strong>Cards</strong>

        <p className="settings-description">
          Edit the word, reading, meaning and example sentences of any card, or
          remove cards you don't want.
        </p>

        <div className="settings-actions">
          <Link className="settings-button" to={`/cards/${deck.id}/list`}>
            <strong>✏️ Edit cards</strong>
          </Link>
          <Link className="settings-button" to={`/cards/${deck.id}`}>
            <strong>▶ Study</strong>
          </Link>
        </div>
      </div>

      <div className="settings-card surface-card">
        <strong>Remove deck</strong>

        <p className="settings-description">
          Deletes the cards, their review progress and their study history from
          this device. Re-importing the same file later restores progress only if
          you keep the deck name the same.
        </p>

        <div className="settings-actions">
          <button className="settings-button deck-danger" onClick={remove}>
            <strong>🗑 Delete deck</strong>
          </button>
        </div>
      </div>
    </div>
  );
}
