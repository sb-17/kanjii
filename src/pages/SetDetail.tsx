import { useParams } from "react-router-dom";
import KanjiCard from "../components/kanji-card/KanjiCard";
import sets from "../data/sets.json";
import { useProgress } from "../context/ProgressContext";
import { getKanji } from "../lib/kanjiIndex";
import EmptyState from "../components/empty-state/EmptyState";

export default function SetDetail() {
  const { setId } = useParams<{ setId: string }>();

  const { progress, setStatus } = useProgress();

  const set = sets.find((s) => s.id === Number(setId));

  if (!set) {
    return (
      <div className="page page-center">
        <EmptyState
          title="Set not found"
          message="That set doesn't exist. Browse the full list of sets instead."
          actions={[{ to: "/sets", label: "Browse sets" }]}
        />
      </div>
    );
  }

  return (
    <div className="page page-center">
      <h1 className="page-title" style={{ width: "100%" }}>
        {set.title}
      </h1>
      {set.kanji.map((k, i) => (
        <KanjiCard
          key={`${set.id}-${i}`}
          kanji={{
            character: k,
            meanings: getKanji(k)?.meanings || [],
          }}
          status={progress[k] || "new"}
          onStatusChange={(newStatus) => setStatus(k, newStatus)}
        />
      ))}
    </div>
  );
}
