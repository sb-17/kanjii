import SetCard from "../components/set-card/SetCard";
import sets from "../data/sets.json";
import { loadKanjiProgress, getStatusCounts } from "../storage/kanjiProgress";
import "../styles/Learn.css";

export default function Learn() {
  const progress = loadKanjiProgress();
  const statusCounts = getStatusCounts(progress);

  return (
    <div className="page page-center">
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
