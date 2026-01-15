import { useParams } from "react-router-dom";
import KanjiCard from "../components/kanji-card/KanjiCard";
import sets from "../data/sets.json";
import kanji from "../data/kanji.json";
import "../styles/SetDetail.css";

export default function SetDetail() {
  const { setId } = useParams<{ setId: string }>();

  const set = sets.find((s) => s.id === Number(setId));

  if (!set) {
    return <div>Set not found</div>;
  }

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
        />
      ))}
    </div>
  );
}
