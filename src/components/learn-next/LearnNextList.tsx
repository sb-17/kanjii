import { Link } from "react-router-dom";
import type { Kanji } from "../../types/kanjiType";
import type { UnlockCandidate } from "../../lib/analytics";

// The "Learn next" list, shared by its Analytics card and the full page it opens.
// One component so the short and long lists can't drift into ranking or
// describing the same kanji differently. Styled by Analytics.css, which both
// callers import.
export default function LearnNextList({
  unlocking,
  nextUp,
}: {
  unlocking: UnlockCandidate[];
  nextUp: Kanji[];
}) {
  return (
    <>
      <p className="stat-note">
        {unlocking.length > 0
          ? "Ranked by how many of your words each one releases."
          : "The most common kanji you haven't started."}
      </p>
      {unlocking.length > 0 ? (
        <ul className="unlock-list">
          {unlocking.map((c) => (
            <li key={c.kanji.character}>
              <Link
                className="unlock-kanji"
                to={`/kanji/${encodeURIComponent(c.kanji.character)}`}
                lang="ja"
              >
                {c.kanji.character}
              </Link>
              <span className="unlock-meaning">
                {c.kanji.meanings.slice(0, 2).join(", ")}
              </span>
              <span className="unlock-count">
                {c.unlocks > 0 ? `unlocks ${c.unlocks}` : `in ${c.blocks} locked`}
              </span>
            </li>
          ))}
        </ul>
      ) : nextUp.length === 0 ? (
        <p className="stat-note">You've started every ranked kanji. 🎉</p>
      ) : (
        <div className="kanji-chips">
          {nextUp.map((k) => (
            <Link
              key={k.character}
              className="kanji-chip"
              to={`/kanji/${encodeURIComponent(k.character)}`}
              title={k.meanings.join(", ")}
            >
              {k.character}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
