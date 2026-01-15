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
    <div
      className="set-card"
      onClick={handleClick}
      style={{ cursor: "pointer" }}
    >
      <div className="set-title">{set.title}</div>
      <div className="kanji-list">
        {set.kanji.map((kanji) => (
          <div className="kanji" key={kanji}>
            {kanji}
          </div>
        ))}
      </div>
    </div>
  );
}
