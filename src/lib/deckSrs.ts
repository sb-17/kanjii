// Scheduling for imported-deck cards. Grading itself is lib/srs `applyReview` —
// the same Leitner ladder as vocab and handwriting; this only decides what to
// show next.
//
// Never-studied cards are a *separate queue*, not entries due at time 0. Ranking
// them together is the mistake that once buried every real review behind a bulk
// import on the vocab side (see lib/srs `scopeVocab`), and an Anki deck is a bulk
// import by definition — often thousands of cards at once.

import type { SrsBox } from "../types/vocabType";
import type { DeckCard } from "../types/deckType";

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

// Reviews that have come round first, most overdue first with a little randomness
// among the front runners so the order isn't identical every session. Only when
// no review is waiting does a never-studied card come up, in deck order — decks
// are usually authored in a deliberate sequence, and shuffling that throws away
// the one bit of ordering information the file carried.
export function pickDeckCard(
  cards: DeckCard[],
  boxes: Record<string, SrsBox>,
  now: number,
  exceptId?: string,
): DeckCard | null {
  const reviews = cards.filter((c) => {
    const box = boxes[c.id];
    return box && box.due <= now;
  });
  const pool = reviews.length > 0 ? reviews : cards.filter((c) => !boxes[c.id]);
  if (pool.length === 0) return null;

  let candidates = pool;
  if (pool.length > 1 && exceptId) {
    const filtered = pool.filter((c) => c.id !== exceptId);
    if (filtered.length > 0) candidates = filtered;
  }

  if (reviews.length > 0) {
    const sorted = [...candidates].sort(
      (a, b) => boxes[a.id].due - boxes[b.id].due,
    );
    const topK = sorted.slice(0, Math.min(5, sorted.length));
    return topK[Math.floor(Math.random() * topK.length)];
  }
  return candidates[0];
}
