import { useEffect } from "react";

// Show-answer / Again / Got it, shared by both card players.
//
// The keyboard handling lives here rather than in Cards and DeckCards because
// this component already owns the only three actions a card has, and both
// players render it — wiring it once means the two can't drift apart.
//
// Deliberately, the keys can only do what the visible buttons can do: when the
// card is face-down the grade keys are dead, exactly as the grade buttons are
// absent. Anki's layout, since anyone arriving with a deck already has it in
// their fingers: Space reveals, then Space or 2 is "Got it" and 1 is "Again".
export default function CardActions({
  flipped,
  onShow,
  onGrade,
}: {
  flipped: boolean;
  onShow: () => void;
  onGrade: (correct: boolean) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal a shortcut (Cmd-R, Ctrl-F…) or a key meant for a field. No
      // card player has a text input today, but the guard costs nothing and this
      // listener is on window.
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      // Auto-repeat would run away: a held Space reveals the card, the next
      // repeat grades it, the one after reveals the following card, and a
      // leaning thumb burns through the queue marking everything correct.
      if (e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (
        el?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName ?? "")
      ) {
        return;
      }

      const space = e.key === " " || e.key === "Spacebar";

      if (!flipped) {
        // Enter as well as Space: Space scrolls by default, so someone who has
        // been scrolling the page may well reach for Enter instead.
        if (space || e.key === "Enter") {
          e.preventDefault();
          onShow();
        }
        return;
      }

      if (e.key === "1") {
        e.preventDefault();
        onGrade(false);
      } else if (e.key === "2" || space || e.key === "Enter") {
        e.preventDefault();
        onGrade(true);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, onShow, onGrade]);

  return (
    <div className="card-actions">
      {flipped ? (
        <>
          <button
            className="card-grade card-grade-again"
            onClick={() => onGrade(false)}
          >
            Again
          </button>
          <button
            className="card-grade card-grade-got"
            onClick={() => onGrade(true)}
          >
            Got it
          </button>
        </>
      ) : (
        <button className="card-show-answer" onClick={onShow}>
          Show answer
        </button>
      )}

      {/* A shortcut nobody knows about helps nobody. Hidden on touch devices,
          where it's noise — see .card-keys in Cards.css. */}
      <p className="card-keys" aria-hidden="true">
        {flipped ? "1 Again · 2 or Space Got it" : "Space Show answer"}
      </p>
    </div>
  );
}
