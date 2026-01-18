import { useState } from "react";
import * as wanakana from "wanakana";
import KanjiCard from "../components/kanji-card/KanjiCard";
import kanji from "../data/kanji.json";
import "../styles/KanjiList.css";
import type { Kanji } from "../types/kanjiType";
import type { KanjiProgress, KanjiStatus } from "../types/kanjiProgress";
import { loadKanjiProgress, updateKanjiStatus } from "../storage/kanjiProgress";

export default function KanjiList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [progress, setProgress] = useState<KanjiProgress>(loadKanjiProgress());
  const [numberOfKanjiShown, setNumberOfKanjiShown] = useState(100);

  const kanjiData = kanji as Kanji[];

  const filteredKanji = kanjiData.filter((k: Kanji) => {
    const term = searchTerm.toLowerCase();

    const characterMatch = k.character.toLowerCase().includes(term);

    const meaningMatch = k.meanings?.some((m: string) =>
      m.toLowerCase().includes(term),
    );

    const kunReadingMatch = k.kun?.some((r: string) =>
      wanakana.toRomaji(r).toLowerCase().includes(term),
    );

    const onReadingMatch = k.on?.some((r: string) =>
      wanakana.toRomaji(r).toLowerCase().includes(term),
    );

    return characterMatch || meaningMatch || kunReadingMatch || onReadingMatch;
  });

  const handleUpdateStatus = (character: string, newStatus: KanjiStatus) => {
    const updatedProgress = updateKanjiStatus(progress, character, newStatus);
    setProgress(updatedProgress);
  };

  return (
    <div className="kanji-list-container">
      <div className="kanji-list-header">
        <input
          type="text"
          placeholder="Search by character, meaning, or reading..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="kanji-list-search-bar"
        />
        <div className="kanji-list-count">
          Showing
          <input
            type="number"
            placeholder=""
            value={numberOfKanjiShown}
            onChange={(e) => setNumberOfKanjiShown(Number(e.target.value))}
            className="kanji-list-count-input"
            min={1}
            max={filteredKanji.length}
            step={1}
          />
          of {filteredKanji.length} kanji
        </div>
      </div>

      {filteredKanji.slice(0, numberOfKanjiShown).map((k, i) => (
        <KanjiCard
          key={`${k.character}-${i}`}
          kanji={{
            character: k.character,
            meanings: k.meanings || [],
          }}
          status={progress[k.character] || "new"}
          onStatusChange={(newStatus) =>
            handleUpdateStatus(k.character, newStatus)
          }
        />
      ))}
    </div>
  );
}
