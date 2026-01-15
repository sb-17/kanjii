import { useState } from "react";
import * as wanakana from "wanakana";
import KanjiCard from "../components/kanji-card/KanjiCard";
import kanji from "../data/kanji.json";
import "../styles/KanjiList.css";
import type { Kanji } from "../types/kanjiType";

export default function KanjiList() {
  const [searchTerm, setSearchTerm] = useState("");

  const kanjiData = kanji as Kanji[];

  const filteredKanji = kanjiData.filter((k: Kanji) => {
    const term = searchTerm.toLowerCase();

    const characterMatch = k.character.toLowerCase().includes(term);

    const meaningMatch = k.meanings?.some((m: string) =>
      m.toLowerCase().includes(term)
    );

    const kunReadingMatch = k.kun?.some((r: string) =>
      wanakana.toRomaji(r).toLowerCase().includes(term)
    );

    const onReadingMatch = k.on?.some((r: string) =>
      wanakana.toRomaji(r).toLowerCase().includes(term)
    );

    return characterMatch || meaningMatch || kunReadingMatch || onReadingMatch;
  });

  return (
    <div className="kanji-list-container">
      <input
        type="text"
        placeholder="Search by character, meaning, or reading..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="kanji-list-search-bar"
      />

      {filteredKanji.map((k, i) => (
        <KanjiCard
          key={`${k.character}-${i}`}
          kanji={{
            character: k.character,
            meanings: k.meanings || [],
          }}
        />
      ))}
    </div>
  );
}
