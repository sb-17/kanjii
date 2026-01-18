import { useParams } from "react-router-dom";
import { useState } from "react";
import kanji from "../data/kanji.json";
import vocab from "../data/vocab.json";
import "../styles/Kanji.css";
import type { KanjiStatus, KanjiProgress } from "../types/kanjiProgress";
import { loadKanjiProgress, updateKanjiStatus } from "../storage/kanjiProgress";
import KanjiStrokeViewer from "../components/kanji-stroke-viewer/KanjiStrokeViewer";
import type { Vocab } from "../types/vocabType";

function isKnownOrLearning(status: KanjiStatus | undefined) {
  return status === "known" || status === "learning";
}

function knownRatio(vocab: Vocab, progress: KanjiProgress) {
  const total = vocab.kanji.length;
  const knownCount = vocab.kanji.filter((k) =>
    isKnownOrLearning(progress[k]),
  ).length;

  return knownCount / total;
}

export default function Kanji() {
  const { char } = useParams<{ char: string }>();
  const [progress, setProgress] = useState<KanjiProgress>(loadKanjiProgress());

  // load kanji data
  const kanjiObj = kanji.find((k) => k.character === char);

  if (!kanjiObj) {
    return <div>Kanji not found</div>;
  }

  const status: KanjiStatus = progress[kanjiObj.character] || "new";

  const updateStatus = (newStatus: KanjiStatus) => {
    const updatedProgress = updateKanjiStatus(
      progress,
      kanjiObj.character,
      newStatus,
    );
    setProgress(updatedProgress);
  };

  // load vocab data
  const filteredVocab = vocab.filter((v) =>
    v.kanji.includes(kanjiObj.character),
  );

  const fullyKnownVocab = filteredVocab.filter((v) =>
    v.kanji.every((k) => isKnownOrLearning(progress[k])),
  );

  const mostlyKnownVocab = filteredVocab.filter((v) => {
    const ratio = knownRatio(v, progress);
    return ratio >= 0.6 && ratio < 1;
  });

  return (
    <div className="kanji-panel">
      <div className="kanji-header">
        <div className="kanji-char">{kanjiObj.character}</div>

        <div className="kanji-info">
          <div className="kanji-meanings">{kanjiObj.meanings.join(", ")}</div>

          <div className="kanji-readings-frequency-strokes">
            {kanjiObj.kun?.length > 0 && (
              <div>
                <strong>Kunyomi:</strong> {kanjiObj.kun.join(", ")}
              </div>
            )}
            {kanjiObj.on?.length > 0 && (
              <div>
                <strong>Onyomi:</strong> {kanjiObj.on.join(", ")}
              </div>
            )}
            <div>
              <strong>Frequency:</strong> {kanjiObj.frequency}{" "}
              <strong>Strokes:</strong> {kanjiObj.strokes}
            </div>
          </div>
        </div>

        <div className="kanji-status-section">
          <strong className="kanji-status-label">Status</strong>

          <select
            id="kanji-status-select"
            className="kanji-status-select"
            value={status}
            onChange={(e) => updateStatus(e.target.value as KanjiStatus)}
          >
            <option value="new">🆕 New</option>
            <option value="learning">🔁 Learning</option>
            <option value="known">✅ Known</option>
          </select>
        </div>
      </div>

      <div className="kanji-stroke-section">
        <KanjiStrokeViewer kanji={kanjiObj.character} />
      </div>

      <div className="kanji-vocab-section">
        <div className="kanji-vocab-fully-known">
          <strong>Vocabulary with known/learning kanji</strong>

          {fullyKnownVocab.map((v) => (
            <div key={v.word}>
              {v.word} [{v.reading}] {v.meanings.join(", ")}
            </div>
          ))}
        </div>

        <div className="kanji-vocab-mostly-known">
          <strong>Vocabulary with some new kanji</strong>

          {mostlyKnownVocab.map((v) => (
            <div key={v.word}>
              {v.word} [{v.reading}] {v.meanings.join(", ")}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
