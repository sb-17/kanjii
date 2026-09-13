import { useRevealGradeKeys } from "../../lib/useRevealGradeKeys";

// Show-answer / Again / Got it, shared by both card players.
//
// The keyboard handling is wired here rather than in Cards and DeckCards because
// this component already owns the only three actions a card has, and both
// players render it. The keys themselves live in useRevealGradeKeys, which paper
// writing practice uses too.
export default function CardActions({
  flipped,
  onShow,
  onGrade,
}: {
  flipped: boolean;
  onShow: () => void;
  onGrade: (correct: boolean) => void;
}) {
  useRevealGradeKeys({ revealed: flipped, onShow, onGrade });

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
