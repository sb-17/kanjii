import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as wanakana from "wanakana";
import kanjiData from "../data/kanji.json";
import type { Kanji } from "../types/kanjiType";
import type { GraphMode } from "../lib/kanjiGraph";
import { isMappableKanji } from "../lib/kanjiGraph";
import { isKnownOrLearning } from "../storage/kanjiProgress";
import { useProgress } from "../context/ProgressContext";
import KanjiGraph from "../components/kanji-graph/KanjiGraph";
import KanjiInfoPanel from "../components/kanji-graph/KanjiInfoPanel";
import "../styles/KanjiMap.css";

const MODES: { id: GraphMode; label: string }[] = [
  { id: "shapes", label: "Shapes" },
  { id: "sounds", label: "Sounds" },
];

const isWideScreen = () =>
  typeof window !== "undefined" && window.innerWidth >= 880;

export default function KanjiMap() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { progress } = useProgress();

  const paramFocus = searchParams.get("focus");
  const paramMode = searchParams.get("mode");

  const defaultCenter = useMemo(() => {
    if (paramFocus && isMappableKanji(paramFocus)) return paramFocus;
    const studying = Object.keys(progress).find(
      (c) => isKnownOrLearning(progress[c]) && isMappableKanji(c),
    );
    return studying ?? "校";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [center, setCenter] = useState(defaultCenter);
  const [mode, setMode] = useState<GraphMode>(
    paramMode === "sounds" ? "sounds" : "shapes",
  );
  const [panelOpen, setPanelOpen] = useState(isWideScreen);
  const [query, setQuery] = useState("");

  // Search index (character + meanings + romaji readings), built once.
  const searchIndex = useMemo(
    () =>
      (kanjiData as Kanji[]).map((k) => ({
        char: k.character,
        meanings: k.meanings,
        text: [
          k.character,
          ...k.meanings,
          ...k.kun.map((r) => wanakana.toRomaji(r)),
          ...k.on.map((r) => wanakana.toRomaji(r)),
        ]
          .join(" ")
          .toLowerCase(),
        freq: k.frequency ?? Number.MAX_SAFE_INTEGER,
      })),
    [],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchIndex
      .filter((e) => e.text.includes(q) || q.includes(e.char.toLowerCase()))
      .sort((a, b) => a.freq - b.freq)
      .slice(0, 8);
  }, [query, searchIndex]);

  const syncParams = (next: { focus?: string; mode?: GraphMode }) => {
    const p = new URLSearchParams(searchParams);
    if (next.focus) p.set("focus", next.focus);
    if (next.mode) p.set("mode", next.mode);
    setSearchParams(p, { replace: true });
  };

  const recenter = (char: string) => {
    setCenter(char);
    syncParams({ focus: char });
  };

  const changeMode = (next: GraphMode) => {
    setMode(next);
    syncParams({ mode: next });
  };

  const pickFromSearch = (char: string) => {
    recenter(char);
    setQuery("");
  };

  return (
    <div className={`kanji-map${panelOpen ? " panel-open" : ""}`}>
      <div className="map-controls">
        <div className="scope-tabs">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`scope-tab${mode === m.id ? " active" : ""}`}
              onClick={() => changeMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="map-search">
          <input
            className="map-search-input"
            type="text"
            value={query}
            placeholder="Find a kanji…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) pickFromSearch(matches[0].char);
            }}
          />
          {matches.length > 0 && (
            <ul className="map-search-results">
              {matches.map((m) => (
                <li key={m.char}>
                  <button
                    type="button"
                    className="map-search-result"
                    onClick={() => pickFromSearch(m.char)}
                  >
                    <span className="map-search-char">{m.char}</span>
                    <span className="map-search-meaning">
                      {m.meanings.slice(0, 3).join(", ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          className="map-panel-toggle"
          onClick={() => setPanelOpen((o) => !o)}
          aria-pressed={panelOpen}
        >
          {panelOpen ? "Hide details" : "Details"}
        </button>
      </div>

      <div className="map-body">
        <div className="map-graph">
          <KanjiGraph
            center={center}
            mode={mode}
            progress={progress}
            onSelect={recenter}
          />
        </div>

        {panelOpen && (
          <>
            <div
              className="map-panel-backdrop"
              onClick={() => setPanelOpen(false)}
            />
            <aside className="map-panel">
              <KanjiInfoPanel char={center} onClose={() => setPanelOpen(false)} />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
