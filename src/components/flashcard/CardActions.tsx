// Show-answer / Again / Got it, shared by both card players.
export default function CardActions({
  flipped,
  onShow,
  onGrade,
}: {
  flipped: boolean;
  onShow: () => void;
  onGrade: (correct: boolean) => void;
}) {
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
    </div>
  );
}
