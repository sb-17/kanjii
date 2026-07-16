import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import kanji from "../data/kanji.json";
import "../styles/Write.css";
import type { Kanji } from "../types/kanjiType";
import type { KanjiProgress } from "../types/kanjiProgress";
import { useProgress } from "../context/ProgressContext";
import { loadSettings, saveSettings } from "../storage/settings";
import type { Settings, WritePool } from "../types/settingsType";
import KanjiWriter, {
  type WriteResult,
} from "../components/kanji-writer/KanjiWriter";
import KanjiStrokeViewer from "../components/kanji-stroke-viewer/KanjiStrokeViewer";
import EmptyState from "../components/empty-state/EmptyState";
import { logWrite } from "../storage/events";

const kanjiData = kanji as Kanji[];

// Kanji to practice in session mode, filtered by the selected status pool. At
// module scope so it's a stable dependency for the memo below.
function computePool(p: WritePool, progress: KanjiProgress): Kanji[] {
  return kanjiData.filter((k) => {
    const status = progress[k.character];
    if (p === "learning") return status === "learning";
    if (p === "known") return status === "known";
    return status === "learning" || status === "known";
  });
}

export default function Write() {
  const { progress } = useProgress();
  // Present on /kanji/:char/write — drills a single kanji on a loop.
  const { char: routeChar } = useParams<{ char?: string }>();
  const single = !!routeChar;

  const [settings, setSettings] = useState<Settings>(loadSettings());
  const { writeMode, guide, writePool } = settings;

  const pool = useMemo(
    () => computePool(writePool, progress),
    [writePool, progress],
  );

  const [current, setCurrent] = useState<string>(() => {
    if (single) return routeChar!;
    if (pool.length > 0)
      return pool[Math.floor(Math.random() * pool.length)].character;
    return "";
  });
  const [revealed, setRevealed] = useState(false);
  // Bumped on every advance so the writer remounts even when the kanji repeats.
  const [round, setRound] = useState(0);

  // Keep up with the URL if you jump straight to another kanji's writing page.
  useEffect(() => {
    if (single && routeChar && routeChar !== current) {
      setCurrent(routeChar);
      setRevealed(false);
      setRound((r) => r + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeChar]);

  const updateSettings = (patch: Partial<Settings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    saveSettings(updated);
  };

  const changePool = (p: WritePool) => {
    updateSettings({ writePool: p });
    setRevealed(false);
    const nextPool = computePool(p, progress);
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
    if (single) return; // single mode keeps the same kanji (round bump remounts)
    if (pool.length > 1) {
      let next = current;
      while (next === current) {
        next = pool[Math.floor(Math.random() * pool.length)].character;
      }
      setCurrent(next);
    } else if (pool.length === 1) {
      setCurrent(pool[0].character);
    }
  };

  // Bad /kanji/:char/write URL.
  if (single && !kanjiData.some((k) => k.character === routeChar)) {
    return (
      <div className="page page-center">
        <EmptyState
          title="Kanji not found"
          message="That character isn't in the kanji list."
          actions={[{ to: "/kanji", label: "Browse kanji" }]}
        />
      </div>
    );
  }

  const obj = kanjiData.find((k) => k.character === current);
  const readings = obj ? [...obj.kun, ...obj.on].slice(0, 3) : [];

  // The writer already shows "Correct!" briefly before calling this. Record how
  // the attempt went before advancing — writing from memory and tracing the
  // template are different evidence, and this log is the only place that
  // difference is kept.
  const handleComplete = (r: WriteResult) => {
    logWrite({
      c: current,
      n: r.strokes,
      m: r.misses,
      h: r.hints,
      g: guide,
      ms: r.ms,
    });
    pickNext();
  };

  const emptyMessage =
    writePool === "both"
      ? "Writing practice uses kanji you've marked Learning or Known. Mark some kanji, or change the filter above."
      : `No kanji marked ${writePool} yet. Mark some, or change the filter above.`;

  return (
    <div className="page page-center">
      {single && (
        <Link to={`/kanji/${current}`} className="write-back">
          ← Back to {current}
        </Link>
      )}

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

      {!single && (
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
      )}

      {!current ? (
        <EmptyState
          title="Nothing to write yet"
          message={emptyMessage}
          actions={[
            { to: "/kanji", label: "Browse kanji" },
            { to: "/sets", label: "Browse sets" },
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
            {single ? "Again" : revealed ? "Next" : "Skip"}
          </button>
        </div>
      )}
    </div>
  );
}
