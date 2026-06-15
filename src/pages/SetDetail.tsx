import { useParams } from "react-router-dom";
import KanjiCard from "../components/kanji-card/KanjiCard";
import sets from "../data/sets.json";
import kanji from "../data/kanji.json";
import { useProgress } from "../context/ProgressContext";

export default function SetDetail() {
  const { setId } = useParams<{ setId: string }>();

  const { progress, setStatus } = useProgress();

  const set = sets.find((s) => s.id === Number(setId));

  if (!set) {
    return <div>Set not found</div>;
  }

  return (
    <div className="page page-center">
      {set.kanji.map((k, i) => (
        <KanjiCard
          key={`${set.id}-${i}`}
          kanji={{
            character: k,
            meanings:
              kanji.find((item) => item.character === k)?.meanings || [],
          }}
          status={progress[k] || "new"}
          onStatusChange={(newStatus) => setStatus(k, newStatus)}
        />
      ))}
    </div>
  );
}
