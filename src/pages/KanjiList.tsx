import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as wanakana from "wanakana";
import KanjiCard from "../components/kanji-card/KanjiCard";
import kanji from "../data/kanji.json";
import "../styles/KanjiList.css";
import type { Kanji } from "../types/kanjiType";
import type { KanjiProgress, KanjiStatus } from "../types/kanjiProgress";
import { loadKanjiProgress, updateKanjiStatus } from "../storage/kanjiProgress";

export default function KanjiList() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialSearchTerm = searchParams.get("q") || "";
  const initialNumberShown = Number(searchParams.get("n") ?? 100);
  const initialStatusFilter =
    searchParams.get("status") === "new" ||
    searchParams.get("status") === "learning" ||
    searchParams.get("status") === "known"
      ? (searchParams.get("status") as KanjiStatus)
      : null;

  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [progress, setProgress] = useState<KanjiProgress>(loadKanjiProgress());
  const [numberOfKanjiShown, setNumberOfKanjiShown] =
    useState(initialNumberShown);
  const [statusFilter, setStatusFilter] = useState<KanjiStatus | null>(
    initialStatusFilter,
  );

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

    const statusMatch = !statusFilter || progress[k.character] === statusFilter;

    return (
      (characterMatch || meaningMatch || kunReadingMatch || onReadingMatch) &&
      statusMatch
    );
  });

  const updateFilter = (key: string, value: string | number | null) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === null || value === "") {
      newParams.delete(key);
    } else {
      newParams.set(key, String(value));
    }
    setSearchParams(newParams, { replace: true });
  };

  const handleUpdateStatus = (character: string, newStatus: KanjiStatus) => {
    const updatedProgress = updateKanjiStatus(progress, character, newStatus);
    setProgress(updatedProgress);
  };

  const statusCounts: Record<KanjiStatus, number> = {
    new: 0,
    learning: 0,
    known: 0,
  };

  Object.values(progress).forEach((status) => {
    if (statusCounts[status] !== undefined) {
      statusCounts[status]++;
    }
  });

  return (
    <div className="kanji-list-container">
      <div className="kanji-list-header">
        <input
          type="text"
          placeholder="Search by character, meaning, or reading..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            updateFilter("q", e.target.value);
          }}
          className="kanji-list-search-bar"
        />
        <div className="kanji-list-count">
          Showing
          <input
            type="number"
            placeholder=""
            value={numberOfKanjiShown}
            onChange={(e) => {
              const val = Number(e.target.value);
              setNumberOfKanjiShown(val);
              updateFilter("n", val);
            }}
            className="kanji-list-count-input"
            min={1}
            max={filteredKanji.length}
            step={1}
          />
          of {filteredKanji.length} kanji
        </div>
      </div>

      <div className="kanji-list-progress">
        <strong
          onClick={() => {
            const newFilter = statusFilter === "learning" ? null : "learning";
            setStatusFilter(newFilter);
            updateFilter("status", newFilter);
          }}
          style={{ cursor: "pointer" }}
        >
          🔁 Learning {statusCounts.learning}
        </strong>
        <strong
          onClick={() => {
            const newFilter = statusFilter === "known" ? null : "known";
            setStatusFilter(newFilter);
            updateFilter("status", newFilter);
          }}
          style={{ cursor: "pointer" }}
        >
          ✅ Known: {statusCounts.known}
        </strong>
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
