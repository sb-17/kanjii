import { useState, useMemo, useLayoutEffect, lazy, Suspense } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import * as wanakana from "wanakana";
import KanjiCard from "../components/kanji-card/KanjiCard";
import kanji from "../data/kanji.json";
import "../styles/KanjiList.css";
import type { Kanji } from "../types/kanjiType";
import type { KanjiStatus } from "../types/kanjiProgress";
import { statusBreakdown, statusEnteredAt } from "../lib/analytics";
import { getKanji } from "../lib/kanjiIndex";
import { loadEvents } from "../storage/events";
import { useProgress } from "../context/ProgressContext";
import ClearableField from "../components/clearable-field/ClearableField";

// The draw pad reaches lib/drawSearch, which carries the ~193 KB stroke-signature
// index. This page is *not* lazy, so importing it directly would put that on the
// critical path for every visitor — it loads only when the pad is opened.
const KanjiDrawPad = lazy(
  () => import("../components/kanji-draw-pad/KanjiDrawPad"),
);

const DEFAULT_SHOWN = 100;

// How the rows are ordered. Frequency is the default and comes free — the search
// index is already built in that order. "added" only means something once you've
// filtered to Learning or Known ("when did this enter *this* list"), so the
// control is shown only then.
type SortKey = "frequency" | "added";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "frequency", label: "Frequency" },
  { id: "added", label: "Recently added" },
];

// Remembered scroll offset per history entry, so returning from a kanji page
// (browser back → same location.key) lands where you left off, while a fresh
// open of the list (new key) starts at the top.
const listScroll = new Map<string, number>();
// History keys are never reused, so one entry per visit grew for as long as the
// tab lived. Only recent entries are ever returned to, so keep an LRU window.
const MAX_REMEMBERED_SCROLLS = 20;

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
  const initialSort: SortKey =
    searchParams.get("sort") === "added" ? "added" : "frequency";

  const { progress, setStatus } = useProgress();
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  // Held as text so the field can be cleared to retype. `Number("")` is 0, which
  // as a count would blank the list mid-edit — fall back to the default instead.
  const [countInput, setCountInput] = useState(initialCountInput);
  const [statusFilter, setStatusFilter] = useState<KanjiStatus | null>(
    initialStatusFilter,
  );
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [drawOpen, setDrawOpen] = useState(false);
  // Ranked characters from the draw pad, or null when it's empty. Not a URL
  // param, unlike the other filters — a drawing can't be put in a query string.
  const [drawMatches, setDrawMatches] = useState<string[] | null>(null);

  // Save/restore the scroll offset of the scrolling pane (.app-content) for this
  // history entry, so back-from-a-kanji returns to the same spot. A fresh visit
  // has no saved offset, so it starts at the top (explicit, to not inherit the
  // previous page's scroll).
  const location = useLocation();
  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>(".app-content");
    if (!el) return;
    el.scrollTop = listScroll.get(location.key) ?? 0;
    const onScroll = () => {
      // delete-then-set moves this key to the end, so the eviction below always
      // drops the least recently scrolled entry and never the current one.
      listScroll.delete(location.key);
      listScroll.set(location.key, el.scrollTop);
      if (listScroll.size > MAX_REMEMBERED_SCROLLS) {
        const oldest = listScroll.keys().next().value;
        if (oldest !== undefined) listScroll.delete(oldest);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [location.key]);

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

  // Re-order by when each kanji entered its current status. Only the filtered
  // rows are sorted (tens–hundreds under a status filter), never the ~2,136-entry
  // index — that stays frequency-ordered and is what "frequency" costs nothing.
  //
  // `loadEvents()` returns a cache that's mutated in place, so it can't serve as
  // a dependency. It doesn't need to: the only events this reads are status
  // transitions, and every one of those goes through setStatus, which also hands
  // ProgressContext a new `progress` object — so `progress` invalidates this memo
  // exactly when a relevant event lands.
  const { sortedKanji, undatedCount } = useMemo(() => {
    if (sort !== "added") {
      return { sortedKanji: filteredKanji, undatedCount: 0 };
    }
    const at = statusEnteredAt(loadEvents(), progress);
    // Undated kanji sort last rather than as epoch 0, which would claim they were
    // marked in 1970 and bury everything real beneath them. Array.sort is stable,
    // so within the undated block the frequency order is preserved.
    const sorted = [...filteredKanji].sort((a, b) => {
      const ta = at.get(a.kanji.character);
      const tb = at.get(b.kanji.character);
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1;
      if (tb == null) return -1;
      return tb - ta; // most recently marked first
    });
    const undated = filteredKanji.filter(
      ({ kanji: k }) => at.get(k.character) == null,
    ).length;
    return { sortedKanji: sorted, undatedCount: undated };
  }, [filteredKanji, sort, progress]);

  const updateFilter = (key: string, value: string | number | null) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === null || value === "") {
      newParams.delete(key);
    } else {
      newParams.set(key, String(value));
    }
    setSearchParams(newParams, { replace: true });
  };

  // Counted over the kanji dataset, so these match the rows the filter actually
  // shows (and Home/Analytics), rather than the raw progress map.
  const statusCounts = statusBreakdown(progress);

  // A drawing *is* the search, so its results stand alone — the text query, sort
  // and status filter are all bypassed while they're showing. Filtering them
  // would be actively unhelpful: you draw a kanji precisely because you don't
  // know it, and a "Learning" filter would then hide the answer.
  const drawRows = useMemo(
    () =>
      drawMatches
        ?.map((ch) => getKanji(ch))
        .filter((k): k is Kanji => k != null)
        .map((k) => ({ kanji: k })) ?? null,
    [drawMatches],
  );

  const rows = drawRows ?? sortedKanji.slice(0, numberOfKanjiShown);

  return (
    <div className="page page-center">
      <div className="kanji-list-header">
        <div className="kanji-list-search-row">
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
          <button
            type="button"
            className={`kanji-list-draw-toggle${drawOpen ? " active" : ""}`}
            onClick={() => setDrawOpen((open) => !open)}
            aria-pressed={drawOpen}
            aria-label={drawOpen ? "Close drawing search" : "Search by drawing"}
            title="Search by drawing"
          >
            ✏️
          </button>
        </div>

        {drawRows ? (
          // Closing the dialog leaves the ranked list in place, so this is the
          // way back to the normal one.
          <div className="kanji-list-count">
            {drawRows.length} closest {drawRows.length === 1 ? "match" : "matches"}
            <button
              type="button"
              className="kanji-list-draw-clear"
              onClick={() => {
                setDrawMatches(null);
                setDrawOpen(false);
              }}
            >
              Clear
            </button>
          </div>
        ) : (
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
        )}
      </div>

      {drawOpen && (
        <Suspense fallback={null}>
          <KanjiDrawPad
            onMatches={setDrawMatches}
            // Closing keeps the matches — the ranked list stays behind the dialog.
            // The ✏️ toggle is what clears them.
            onClose={() => setDrawOpen(false)}
          />
        </Suspense>
      )}

      {!drawRows && (
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
      )}

      {/* "Recently added" answers "when did this enter this list", so it's only
          meaningful once a status filter narrows the list to one. */}
      {statusFilter && !drawRows && (
        <div className="kanji-list-sort">
          <span className="kanji-list-sort-label">Sort</span>
          <div className="scope-tabs">
            {SORTS.map((s) => (
              <button
                key={s.id}
                className={`scope-tab${sort === s.id ? " active" : ""}`}
                onClick={() => {
                  setSort(s.id);
                  // Keep the default out of the URL, as the status filter does.
                  updateFilter("sort", s.id === "frequency" ? null : s.id);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {statusFilter && !drawRows && sort === "added" && undatedCount > 0 && (
        <p className="kanji-list-sort-note">
          {undatedCount} of these {undatedCount === 1 ? "has" : "have"} no date
          — marked before this was tracked, or restored from a progress file.
          Shown last.
        </p>
      )}

      {rows.map(({ kanji: k }) => (
        <KanjiCard
          key={k.character}
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
