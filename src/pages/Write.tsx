import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import kanji from "../data/kanji.json";
import "../styles/Write.css";
import type { Kanji } from "../types/kanjiType";
import { useProgress } from "../context/ProgressContext";
import { loadSettings, saveSettings } from "../storage/settings";
import type { Settings, WritePool } from "../types/settingsType";
import KanjiWriter from "../components/kanji-writer/KanjiWriter";
import KanjiStrokeViewer from "../components/kanji-stroke-viewer/KanjiStrokeViewer";
import EmptyState from "../components/empty-state/EmptyState";

export default function Write() {
  const { progress } = useProgress();
  const [searchParams] = useSearchParams();
  const focus = searchParams.get("kanji") || "";

  const [settings, setSettings] = useState<Settings>(loadSettings());
  const { writeMode, guide, writePool } = settings;

  const kanjiData = kanji as Kanji[];

  // Kanji to practice, filtered by the selected status pool.
  const computePool = (p: WritePool) =>
    kanjiData.filter((k) => {
      const status = progress[k.character];
      if (p === "learning") return status === "learning";
      if (p === "known") return status === "known";
      return status === "learning" || status === "known";
    });

  const pool = useMemo(() => computePool(writePool), [progress, writePool]);

  const focusValid = !!focus && kanjiData.some((k) => k.character === focus);

  const [current, setCurrent] = useState<string>(() => {
    if (focusValid) return focus;
    if (pool.length > 0)
      return pool[Math.floor(Math.random() * pool.length)].character;
    return "";
  });
  const [revealed, setRevealed] = useState(false);
  // Bumped on every advance so the writer remounts even when the kanji repeats
  // (single-kanji pool, or a focused kanji that isn't in the pool).
  const [round, setRound] = useState(0);

  const updateSettings = (patch: Partial<Settings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    saveSettings(updated);
  };

  const changePool = (p: WritePool) => {
    updateSettings({ writePool: p });
    setRevealed(false);
    const nextPool = computePool(p);
    // Keep the current kanji if it still matches; otherwise move to a new one.
    if (nextPool.some((k) => k.character === current)) return;
    setRound((r) => r + 1);
    setCurrent(
      nextPool.length > 0
        ? nextPool[Math.floor(Math.random() * nextPool.length)].character
        : "",
    );
  };

  const pickNext = () => {
    setRevealed(false);
    setRound((r) => r + 1);
    if (pool.length > 1) {
      let next = current;
      while (next === current) {
        next = pool[Math.floor(Math.random() * pool.length)].character;
      }
      setCurrent(next);
    } else if (pool.length === 1) {
      setCurrent(pool[0].character);
    }
    // pool empty: keep the focused kanji; the round bump remounts the writer
  };

  const obj = kanjiData.find((k) => k.character === current);
  const readings = obj ? [...obj.kun, ...obj.on].slice(0, 3) : [];

  // The writer already shows "Correct!" briefly before calling this.
  const handleComplete = () => pickNext();

  const emptyMessage =
    writePool === "both"
      ? "Writing practice uses kanji you've marked Learning or Known. Mark some kanji, or change the filter above."
      : `No kanji marked ${writePool} yet. Mark some, or change the filter above.`;

  return (
    <div className="page page-center">
      {current && (
        <div className="write-prompt">
          <strong>Write:</strong> {obj ? obj.meanings.join(", ") : current}
          {readings.length > 0 && (
            <span className="write-reading"> ({readings.join(", ")})</span>
          )}
        </div>
      )}

      <div className="write-toggles">
        <div className="write-modes">
          <button
            className={`write-toggle${writeMode === "screen" ? " active" : ""}`}
            onClick={() => updateSettings({ writeMode: "screen" })}
          >
            Screen
          </button>
          <button
            className={`write-toggle${writeMode === "paper" ? " active" : ""}`}
            onClick={() => updateSettings({ writeMode: "paper" })}
          >
            Paper
          </button>
        </div>

        {writeMode === "screen" && (
          <label className="write-guide">
            <input
              type="checkbox"
              checked={guide}
              onChange={(e) => updateSettings({ guide: e.target.checked })}
            />
            <span>Guide</span>
          </label>
        )}
      </div>

      <div className="write-toggles">
        <span className="write-toggle-label">Practising:</span>
        <div className="write-modes">
          {(["both", "learning", "known"] as const).map((p) => (
            <button
              key={p}
              className={`write-toggle${writePool === p ? " active" : ""}`}
              onClick={() => changePool(p)}
            >
              {p === "both" ? "Both" : p === "learning" ? "Learning" : "Known"}
            </button>
          ))}
        </div>
      </div>

      {!current ? (
        <EmptyState
          title="Nothing to write yet"
          message={emptyMessage}
          actions={[
            { to: "/kanji-list", label: "Browse kanji" },
            { to: "/learn", label: "Browse by set" },
          ]}
        />
      ) : writeMode === "screen" ? (
        <KanjiWriter
          key={`${current}-${round}`}
          kanji={current}
          guide={guide}
          onComplete={handleComplete}
        />
      ) : (
        <div className="write-paper">
          {revealed ? (
            <>
              <div className="write-answer">{current}</div>
              <KanjiStrokeViewer kanji={current} />
            </>
          ) : (
            <p className="write-paper-hint">
              Write it on paper from memory, then reveal to check.
            </p>
          )}
          {!revealed && (
            <div className="write-paper-actions">
              <button className="write-action" onClick={() => setRevealed(true)}>
                Show answer
              </button>
            </div>
          )}
        </div>
      )}

      {current && (
        <div className="write-actions">
          <button className="write-action" onClick={pickNext}>
            {revealed ? "Next" : "Skip"}
          </button>
        </div>
      )}
    </div>
  );
}
