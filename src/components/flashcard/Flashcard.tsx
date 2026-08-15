import type { ReactNode } from "react";

// The flip shell shared by the My Words cards and imported-deck cards. Only the
// two faces differ between them; the container, the flip state class and the tap
// hints are identical, and duplicating them was how the two would drift apart.
// Styling stays in Cards.css — the class names are unchanged.
export default function Flashcard({
  flipped,
  onFlip,
  front,
  back,
}: {
  flipped: boolean;
  onFlip: () => void;
  front: ReactNode;
  back: ReactNode;
}) {
  return (
    <div
      className={`flashcard-container ${flipped ? "flipped" : ""}`}
      onClick={onFlip}
    >
      <div className="flashcard-inner">
        <div className="flashcard-front">
          {front}
          <span className="tap-hint">Tap to flip</span>
        </div>

        <div className="flashcard-back">
          {back}
          <span className="tap-hint">Tap to flip back</span>
        </div>
      </div>
    </div>
  );
}
