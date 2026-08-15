// Scheduling for imported-deck cards. Grading itself is lib/srs `applyReview` —
// the same Leitner ladder as vocab and handwriting; this only decides what to
// show next.
//
// Never-studied cards are a *separate queue*, not entries due at time 0. Ranking
// them together is the mistake that once buried every real review behind a bulk
// import on the vocab side (see lib/srs `scopeVocab`), and an Anki deck is a bulk
// import by definition — often thousands of cards at once.

import type { SrsBox } from "../types/vocabType";
import type { DeckCard, DeckScope } from "../types/deckType";

export type DeckCounts = { due: number; fresh: number; total: number };

export function deckCounts(
  cards: DeckCard[],
  boxes: Record<string, SrsBox>,
  now: number,
): DeckCounts {
  let due = 0;
  let fresh = 0;
  for (const card of cards) {
    const box = boxes[card.id];
    if (!box) fresh++;
    else if (box.due <= now) due++;
  }
  return { due, fresh, total: cards.length };
}

// Which cards a scope is willing to show. Kept separate from picking so the page
// can tell "nothing left in this mode" from "this deck is empty".
export function scopeDeckCards(
  cards: DeckCard[],
  boxes: Record<string, SrsBox>,
  scope: DeckScope,
  now: number,
): DeckCard[] {
  switch (scope) {
    case "new":
      return cards.filter((c) => !boxes[c.id]);
    case "random":
    case "all":
      return cards;
    case "due":
    default: {
      // Reviews first; never-studied cards only once the queue is clear. They are
      // a separate queue, never entries due at time 0 — see the note above.
      const reviews = cards.filter((c) => {
        const box = boxes[c.id];
        return box && box.due <= now;
      });
      return reviews.length > 0 ? reviews : cards.filter((c) => !boxes[c.id]);
    }
  }
}

// Pick the next card for a scope.
//
//   due    — most overdue first, with a little randomness among the front runners
//            so the order isn't identical every session; falls through to new
//            cards in deck order once no review is waiting.
//   new    — deck order. A graded card gains a box and leaves this pool, so the
//            queue advances on its own without tracking a position.
//   all    — deck order, cycling. The pool never shrinks here, so "next" is
//            defined relative to the card just shown rather than by index 0,
//            which would otherwise ping-pong between the first two cards.
//   random — uniform over the whole deck, ignoring the schedule.
//
// Deck order is respected wherever the schedule doesn't override it: decks are
// usually authored in a deliberate sequence, and shuffling throws away the one
// piece of ordering information the file carried.
export function pickDeckCard(
  cards: DeckCard[],
  boxes: Record<string, SrsBox>,
  scope: DeckScope,
  now: number,
  exceptId?: string,
): DeckCard | null {
  const pool = scopeDeckCards(cards, boxes, scope, now);
  if (pool.length === 0) return null;

  if (scope === "all") {
    const index = pool.findIndex((c) => c.id === exceptId);
    // findIndex returns -1 when nothing was shown yet, which lands on 0.
    return pool[(index + 1) % pool.length];
  }

  let candidates = pool;
  if (pool.length > 1 && exceptId) {
    const filtered = pool.filter((c) => c.id !== exceptId);
    if (filtered.length > 0) candidates = filtered;
  }

  if (scope === "random") {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  if (scope === "due") {
    const reviews = candidates.filter((c) => boxes[c.id]);
    if (reviews.length > 0) {
      const sorted = [...reviews].sort(
        (a, b) => boxes[a.id].due - boxes[b.id].due,
      );
      const topK = sorted.slice(0, Math.min(5, sorted.length));
      return topK[Math.floor(Math.random() * topK.length)];
    }
  }
  return candidates[0];
}
