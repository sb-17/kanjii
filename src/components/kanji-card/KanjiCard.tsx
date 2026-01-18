import { useNavigate } from "react-router-dom";
import "./KanjiCard.css";
import type { KanjiStatus } from "../../types/kanjiProgress";

export default function KanjiCard({
  kanji,
  status,
  onStatusChange,
}: {
  kanji: { character: string; meanings: string[] };
  status: KanjiStatus;
  onStatusChange: (newStatus: KanjiStatus) => void;
}) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/kanji/${kanji.character}`);
  };

  return (
    <div className="kanji-card">
      <div className="kanji-row">
        <div
          className="kanji-row-left"
          onClick={handleClick}
          style={{ cursor: "pointer" }}
        >
          <div className="kanji">{kanji.character}</div>
          <div className="kanji-meanings">{kanji.meanings.join(", ")}</div>
        </div>

        <div className="kanji-row-right">
          <select
            id="kanji-status-select"
            className="kanji-status-select"
            value={status}
            onChange={(e) => onStatusChange(e.target.value as KanjiStatus)}
          >
            <option value="new">🆕 New</option>
            <option value="learning">🔁 Learning</option>
            <option value="known">✅ Known</option>
          </select>
        </div>
      </div>
    </div>
  );
}
