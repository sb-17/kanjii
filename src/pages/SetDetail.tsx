import { useParams } from "react-router-dom";
import { useState } from "react";
import KanjiCard from "../components/kanji-card/KanjiCard";
import sets from "../data/sets.json";
import kanji from "../data/kanji.json";
import "../styles/SetDetail.css";
import type { KanjiProgress, KanjiStatus } from "../types/kanjiProgress";
import { loadKanjiProgress, updateKanjiStatus } from "../storage/kanjiProgress";

export default function SetDetail() {
  const { setId } = useParams<{ setId: string }>();

  const [progress, setProgress] = useState<KanjiProgress>(loadKanjiProgress());

  const set = sets.find((s) => s.id === Number(setId));

  if (!set) {
    return <div>Set not found</div>;
  }

  const handleUpdateStatus = (character: string, newStatus: KanjiStatus) => {
    const updatedProgress = updateKanjiStatus(progress, character, newStatus);
    setProgress(updatedProgress);
  };

  return (
    <div className="kanji-container">
      {set.kanji.map((k, i) => (
        <KanjiCard
          key={`${set.id}-${i}`}
          kanji={{
            character: k,
            meanings:
              kanji.find((item) => item.character === k)?.meanings || [],
          }}
          status={progress[k] || "new"}
          onStatusChange={(newStatus) => handleUpdateStatus(k, newStatus)}
        />
      ))}
    </div>
  );
}
