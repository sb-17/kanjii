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
  // Held in state so the counts above update the moment progress is reset,
  // rather than only after navigating away and back.
  const [boxes, setBoxes] = useState(() => deckBoxes(deckId));

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

  const counts = deckCounts(deck.cards, boxes, now);
  const studied = deckTotals(loadDeckStats())[deck.id];
  const studiedCards = Object.keys(boxes).length;

  // Renaming keeps the deck's id. The id is derived from the *original* name and
  // is what backed-up progress is filed under, so recomputing it here would
  // orphan every box this deck has earned. The consequence to know: to line a
  // renamed deck up with another device, re-import there under the original name.
  const rename = () => {
    const next = name.trim();
    if (!next || next === deck.name) return;
    updateDeck({ ...deck, name: next });
  };

  // Clears the Leitner boxes only. The study counters behind the Analytics
  // "Decks" section are left alone on purpose: they record what you actually did
  // on given days, and un-scheduling the cards doesn't make that untrue. Deleting
  // the whole deck does clear both, since then there's nothing left to attribute
  // them to.
  const resetProgress = () => {
    if (studiedCards === 0) return;
    if (
      !confirm(
        `Reset progress for "${deck.name}"?\n\n` +
          `${studiedCards} of ${deck.cards.length} cards go back to new, so the whole deck starts over. The cards themselves are kept, and your study history in Analytics is not affected.\n\n` +
          "This cannot be undone.",
      )
    ) {
      return;
    }
    clearDeckProgress(deck.id);
    setBoxes({});
  };

  const remove = () => {
    if (
      !confirm(
        `Delete "${deck.name}"?\n\n` +
          `${deck.cards.length} cards, review progress for ${studiedCards} of them, and this deck's study history in Analytics are all removed.\n\n` +
          "This cannot be undone — re-importing the deck later starts it from scratch.",
      )
    ) {
      return;
    }
    // Cards, boxes and counters all go: a delete is a full removal, so nothing
    // stays attributed to an id the app can no longer name, and the deck leaves
    // Analytics with it. That makes deleting irreversible, so *updating* a deck
    // means re-importing over it under the same name — never deleting first.
    // "Reset progress" above is the way to start the deck over while keeping it.
    clearDeckProgress(deck.id);
    clearDeckStats(deck.id);
    saveDecks(loadDecks().filter((d) => d.id !== deck.id));
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
        <strong>Reset progress</strong>

        <p className="settings-description">
          {studiedCards === 0
            ? "Nothing to reset — no card in this deck has been studied yet."
            : `Sends all ${studiedCards} studied cards back to new so the deck starts over. The cards stay, and your study history in Analytics is kept.`}
        </p>

        <div className="settings-actions">
          <button
            className="settings-button"
            onClick={resetProgress}
            disabled={studiedCards === 0}
          >
            <strong>↺ Reset progress</strong>
          </button>
        </div>
      </div>

      <div className="settings-card surface-card">
        <strong>Remove deck</strong>

        <p className="settings-description">
          Deletes the cards, their review progress and their study history. To
          update this deck from a newer file, don't delete it — import the file
          again under the same name and your progress is kept.
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
