import { useMemo } from "react";
import { Link } from "react-router-dom";
import "../styles/Analytics.css";
import { useProgress } from "../context/ProgressContext";
import { loadUserVocab } from "../storage/userVocab";
import { mostFrequentNew, mostUnlocking } from "../lib/analytics";
import LearnNextList from "../components/learn-next/LearnNextList";

// Longest the list gets. Past about twenty the tail is ranked on a single locked
// word each, which says little about which one to pick.
const LEARN_NEXT_MAX = 20;

// The Analytics "Learn next" card, opened up. A page rather than expanding the
// card in place: a card twenty rows tall leaves a block of dead space beside it
// in the grid, which is the exact thing that card was split out to avoid.
export default function LearnNext() {
  const { progress } = useProgress();
  const vocab = loadUserVocab();
  const unlocking = useMemo(
    () => mostUnlocking(vocab, progress, LEARN_NEXT_MAX),
    [vocab, progress],
  );
  const nextUp = useMemo(
    () => mostFrequentNew(progress, LEARN_NEXT_MAX),
    [progress],
  );

  return (
    <div className="page">
      <Link to="/analytics" className="learn-next-back">
        ← Analytics
      </Link>
      <h1 className="page-title">Learn next</h1>
      <section className="stat-card surface-card">
        <LearnNextList unlocking={unlocking} nextUp={nextUp} />
      </section>
    </div>
  );
}
