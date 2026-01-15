import { useParams } from "react-router-dom";
import kanji from "../data/kanji.json";
import "../styles/Kanji.css";

export default function Kanji() {
  const { char } = useParams<{ char: string }>();

  const kanjiObj = kanji.find((k) => k.character === char);

  if (!kanjiObj) {
    return <div>Kanji not found</div>;
  }

  return (
    <div className="kanji-panel">
      <div className="kanji-header">
        <div className="kanji-char">{kanjiObj.character}</div>
        <div className="kanji-info">
          <div className="kanji-meanings">{kanjiObj.meanings.join(", ")}</div>
          <div className="kanji-readings-frequency-strokes">
            {kanjiObj.on?.length > 0 && (
              <div>
                <strong>Onyomi:</strong> {kanjiObj.on.join(", ")}
              </div>
            )}
            {kanjiObj.kun?.length > 0 && (
              <div>
                <strong>Kunyomi:</strong> {kanjiObj.kun.join(", ")}
              </div>
            )}
            <strong>Frequency:</strong> {kanjiObj.frequency}{" "}
            <strong>Strokes:</strong> {kanjiObj.strokes}
          </div>
        </div>
      </div>
    </div>
  );
}
