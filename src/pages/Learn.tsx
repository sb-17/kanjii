import SetCard from "../components/set-card/SetCard";
import sets from "../data/sets.json";
import { loadKanjiProgress } from "../storage/kanjiProgress";
import type { KanjiStatus } from "../types/kanjiProgress";
import "../styles/Learn.css";

export default function Learn() {
  const progress = loadKanjiProgress();

  const statusCounts: Record<KanjiStatus, number> = {
    new: 0,
    learning: 0,
    known: 0,
  };

  Object.values(progress).forEach((status) => {
    if (statusCounts[status] !== undefined) {
      statusCounts[status]++;
    }
  });

  return (
    <div className="learn-page">
      <div className="learn-progress">
        <strong>🔁 Learning: {statusCounts.learning}</strong>
        <strong>✅ Known: {statusCounts.known}</strong>
      </div>

      <div className="sets-container">
        {sets.map((set) => (
          <SetCard key={set.id} set={set} />
        ))}
      </div>
    </div>
  );
}
