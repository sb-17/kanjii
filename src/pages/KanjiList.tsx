import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import * as wanakana from "wanakana";
import KanjiCard from "../components/kanji-card/KanjiCard";
import kanji from "../data/kanji.json";
import "../styles/KanjiList.css";
import type { Kanji } from "../types/kanjiType";
import type { KanjiStatus } from "../types/kanjiProgress";
import { getStatusCounts } from "../storage/kanjiProgress";
import { useProgress } from "../context/ProgressContext";
import ClearableField from "../components/clearable-field/ClearableField";

const DEFAULT_SHOWN = 100;

export default function KanjiList() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialSearchTerm = searchParams.get("q") || "";
  const initialCountInput = searchParams.get("n") ?? String(DEFAULT_SHOWN);
  const initialStatusFilter =
    searchParams.get("status") === "new" ||
    searchParams.get("status") === "learning" ||
    searchParams.get("status") === "known"
      ? (searchParams.get("status") as KanjiStatus)
      : null;

  const { progress, setStatus } = useProgress();
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  // Held as text so the field can be cleared to retype. `Number("")` is 0, which
  // as a count would blank the list mid-edit — fall back to the default instead.
  const [countInput, setCountInput] = useState(initialCountInput);
  const [statusFilter, setStatusFilter] = useState<KanjiStatus | null>(
    initialStatusFilter,
  );

  const parsedCount = Math.floor(Number(countInput));
  const numberOfKanjiShown =
    countInput.trim() !== "" && Number.isFinite(parsedCount) && parsedCount > 0
      ? parsedCount
      : DEFAULT_SHOWN;

  // Build the search index once: flatten each kanji's character, meanings, and
  // romaji-converted readings into a single lowercased string, sorted by
  // frequency. This keeps the expensive wanakana romaji conversion out of the
  // per-keystroke filter (it used to run over all ~2,136 kanji on every render).
  const searchIndex = useMemo(
    () =>
      (kanji as Kanji[])
        .map((k) => ({
          kanji: k,
          text: [
            k.character,
            ...k.meanings,
            ...k.kun.map((r) => wanakana.toRomaji(r)),
            ...k.on.map((r) => wanakana.toRomaji(r)),
          ]
            .join(" ")
            .toLowerCase(),
        }))
        .sort((a, b) => {
          const af = a.kanji.frequency;
          const bf = b.kanji.frequency;
          if (af == null && bf == null) return 0;
          if (af == null) return 1;
          if (bf == null) return -1;
          return af - bf;
        }),
    [],
  );

  const filteredKanji = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return searchIndex.filter(({ kanji: k, text }) => {
      const textMatch =
        !term ||
        text.includes(term) ||
        term.includes(k.character.toLowerCase());
      const statusMatch =
        !statusFilter || progress[k.character] === statusFilter;
      return textMatch && statusMatch;
    });
  }, [searchIndex, searchTerm, statusFilter, progress]);

  const updateFilter = (key: string, value: string | number | null) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === null || value === "") {
      newParams.delete(key);
    } else {
      newParams.set(key, String(value));
    }
    setSearchParams(newParams, { replace: true });
  };

  const statusCounts = getStatusCounts(progress);

  return (
    <div className="page page-center">
      <div className="kanji-list-header">
        <ClearableField
          className="kanji-list-search-wrap"
          show={searchTerm.length > 0}
          onClear={() => {
            setSearchTerm("");
            updateFilter("q", "");
          }}
          label="Clear search"
        >
          <input
            type="text"
            id="kanji-list-search-bar"
            placeholder="Search by character, meaning, or reading..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              updateFilter("q", e.target.value);
            }}
            className="kanji-list-search-bar"
          />
        </ClearableField>
        <div className="kanji-list-count">
          Showing
          <input
            type="number"
            placeholder=""
            value={countInput}
            onChange={(e) => {
              setCountInput(e.target.value);
              updateFilter("n", e.target.value);
            }}
            className="kanji-list-count-input"
            id="kanji-list-count-input"
            min={1}
            max={filteredKanji.length}
            step={1}
          />
          of {filteredKanji.length} kanji
        </div>
      </div>

      <div className="kanji-list-progress">
        <button
          type="button"
          className={`kanji-list-filter${statusFilter === "learning" ? " active" : ""}`}
          aria-pressed={statusFilter === "learning"}
          onClick={() => {
            const newFilter = statusFilter === "learning" ? null : "learning";
            setStatusFilter(newFilter);
            updateFilter("status", newFilter);
          }}
        >
          🔁 Learning {statusCounts.learning}
        </button>
        <button
          type="button"
          className={`kanji-list-filter${statusFilter === "known" ? " active" : ""}`}
          aria-pressed={statusFilter === "known"}
          onClick={() => {
            const newFilter = statusFilter === "known" ? null : "known";
            setStatusFilter(newFilter);
            updateFilter("status", newFilter);
          }}
        >
          ✅ Known {statusCounts.known}
        </button>
      </div>

      {filteredKanji.slice(0, numberOfKanjiShown).map(({ kanji: k }, i) => (
        <KanjiCard
          key={`${k.character}-${i}`}
          kanji={{
            character: k.character,
            meanings: k.meanings || [],
          }}
          status={progress[k.character] || "new"}
          onStatusChange={(newStatus) => setStatus(k.character, newStatus)}
        />
      ))}
    </div>
  );
}
