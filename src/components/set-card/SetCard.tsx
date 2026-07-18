import { useNavigate } from "react-router-dom";
import "./SetCard.css";

export default function SetCard({
  set,
}: {
  set: { id: number; title: string; kanji: string[] };
}) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/sets/${set.id}`);
  };

  return (
    <button type="button" className="set-card" onClick={handleClick}>
      <div className="set-title">{set.title}</div>
      <div className="kanji-list">
        {set.kanji.map((kanji, i) => (
          <div className="kanji" key={kanji + "-" + i.toString()}>
            {kanji}
          </div>
        ))}
      </div>
    </button>
  );
}
