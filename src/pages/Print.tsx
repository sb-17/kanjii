import { useMemo, useState } from "react";
import "../styles/Print.css";
import sets from "../data/sets.json";
import { useProgress } from "../context/ProgressContext";
import { extractKanji } from "../lib/vocab";
import { ALL_KANJI, getKanji } from "../lib/kanjiIndex";

type Source = "set" | "learning" | "known" | "custom";

const MAX_ROWS = 200;

export default function Print() {
  const { progress } = useProgress();
  const [source, setSource] = useState<Source>("set");
  const [setId, setSetId] = useState<number>(sets[0]?.id ?? 1);
  const [custom, setCustom] = useState("");
  const [columns, setColumns] = useState(10);
  const [guideCells, setGuideCells] = useState(1);
  const [showInfo, setShowInfo] = useState(true);

  // All candidate kanji for the current source (before the include/exclude pick).
  const baseChars = useMemo(() => {
    if (source === "set") return sets.find((s) => s.id === setId)?.kanji ?? [];
    if (source === "custom") return [] as string[];
    return ALL_KANJI
      .filter((k) => progress[k.character] === source)
      .map((k) => k.character);
  }, [source, setId, progress]);

  // Nothing is selected by default — the user picks which kanji (or taps "All").
  // Tracking the *included* set (starting empty) means no select-then-deselect
  // flash on load / when switching source.
  const [included, setIncluded] = useState<Set<string>>(new Set());

  // Clear the picks when the source changes. Done during render rather than in an
  // effect: an effect renders the new source's chars against the old selection
  // first, then re-renders empty. Adjusting here means that intermediate state is
  // never shown. (React's "adjusting state when a prop changes" pattern.)
  const [lastKey, setLastKey] = useState(`${source}|${setId}`);
  const sourceKey = `${source}|${setId}`;
  if (sourceKey !== lastKey) {
    setLastKey(sourceKey);
    setIncluded(new Set());
  }

  const toggleChar = (c: string) =>
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const chars = useMemo(
    () =>
      source === "custom"
        ? extractKanji(custom)
        : baseChars.filter((c) => included.has(c)),
    [source, custom, baseChars, included],
  );

  const shown = chars.slice(0, MAX_ROWS);
  const guides = Math.min(guideCells, columns);

  return (
    <div className="page print-page">
      <h1 className="page-title no-print">Print practice sheet</h1>

      <div className="print-controls no-print surface-card">
        <div className="print-control">
          <span className="print-control-label">Kanji from</span>
          <div className="print-source">
            {(["set", "learning", "known", "custom"] as Source[]).map((s) => (
              <button
                key={s}
                className={`print-source-btn${source === s ? " active" : ""}`}
                onClick={() => setSource(s)}
              >
                {s === "set"
                  ? "Set"
                  : s === "learning"
                    ? "Learning"
                    : s === "known"
                      ? "Known"
                      : "Custom"}
              </button>
            ))}
          </div>
        </div>

        {source === "set" && (
          <label className="print-control">
            <span className="print-control-label">Set</span>
            <select
              className="print-select"
              value={setId}
              onChange={(e) => setSetId(Number(e.target.value))}
            >
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {source === "custom" && (
          <label className="print-control">
            <span className="print-control-label">Kanji</span>
            <textarea
              className="print-custom"
              rows={2}
              placeholder="Type or paste kanji…"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </label>
        )}

        {source !== "custom" && baseChars.length > 0 && (
          <div className="print-control">
            <div className="print-pick-header">
              <span className="print-control-label">
                Include {chars.length}/{baseChars.length}
              </span>
              <span className="print-pick-actions">
                <button
                  type="button"
                  className="print-pick-btn"
                  onClick={() => setIncluded(new Set(baseChars))}
                >
                  All
                </button>
                <button
                  type="button"
                  className="print-pick-btn"
                  onClick={() => setIncluded(new Set())}
                >
                  None
                </button>
              </span>
            </div>
            <div className="print-chips">
              {baseChars.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`print-chip${included.has(c) ? " active" : ""}`}
                  onClick={() => toggleChar(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="print-control">
          <span className="print-control-label">Cells per row: {columns}</span>
          <input
            type="range"
            min={5}
            max={15}
            value={columns}
            onChange={(e) => setColumns(Number(e.target.value))}
          />
        </label>

        <label className="print-control">
          <span className="print-control-label">Trace-guide cells: {guides}</span>
          <input
            type="range"
            min={0}
            max={columns}
            value={guides}
            onChange={(e) => setGuideCells(Number(e.target.value))}
          />
        </label>

        <label className="print-checkbox">
          <input
            type="checkbox"
            checked={showInfo}
            onChange={(e) => setShowInfo(e.target.checked)}
          />
          <span>Show reading &amp; meaning</span>
        </label>

        <button
          className="print-button"
          onClick={() => window.print()}
          disabled={shown.length === 0}
        >
          🖨 Print / Save as PDF
        </button>

        {chars.length === 0 ? (
          <p className="print-note">
            Nothing to print yet — pick a source that has some kanji.
          </p>
        ) : (
          <p className="print-note">
            {chars.length} kanji
            {chars.length > MAX_ROWS
              ? ` — showing the first ${MAX_ROWS}; narrow the selection for the rest`
              : ""}
          </p>
        )}

        <p className="print-note">
          Tip: to print on both sides, turn on “Two-sided” / “Duplex” in your
          print dialog (it's a printer setting, not part of the sheet).
        </p>
      </div>

      <div className="print-preview">
        <div className="print-sheet">
          {shown.length === 0 ? (
            <p className="print-sheet-empty">
              Pick some kanji above to build your sheet.
            </p>
          ) : (
            shown.map((ch, i) => {
              const info = getKanji(ch);
              const reading = info ? [...info.kun, ...info.on][0] : undefined;
              return (
                <div className="print-row" key={`${ch}-${i}`}>
                  <div className="print-label">
                    <span className="print-label-kanji">{ch}</span>
                    {showInfo && info && (
                      <span className="print-label-info">
                        {reading ? `${reading} ` : ""}
                        {info.meanings[0] ?? ""}
                      </span>
                    )}
                  </div>
                  <div
                    className="print-cells"
                    style={{ ["--cols"]: columns } as React.CSSProperties}
                  >
                    {Array.from({ length: columns }).map((_, c) => (
                      <div
                        className={`print-cell${c < guides ? " has-trace" : ""}`}
                        key={c}
                      >
                        {c < guides && <span className="print-trace">{ch}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
