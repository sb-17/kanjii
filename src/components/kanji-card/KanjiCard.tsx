import { useNavigate } from "react-router-dom";
import "./KanjiCard.css";

export default function KanjiCard({
  kanji,
}: {
  kanji: { character: string; meanings: string[] };
}) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/kanji/${kanji.character}`);
  };

  return (
    <div
      className="kanji-card"
      onClick={handleClick}
      style={{ cursor: "pointer" }}
    >
      <div className="kanji-row">
        <div className="kanji">{kanji.character}</div>
        <div className="kanji-meanings">{kanji.meanings.join(", ")}</div>
      </div>
    </div>
  );
}
