import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import * as wanakana from "wanakana";
import "../styles/MyWords.css";
import type { Vocab } from "../types/vocabType";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { loadSettings, saveSettings } from "../storage/settings";
import { extractKanji } from "../lib/vocab";
import { isNew, reviewDueKey } from "../lib/srs";
import ClearableField from "../components/clearable-field/ClearableField";

const keyOf = (v: Vocab) => `${v.word}|${v.reading}`;

// Rows rendered before "Show more". A long list is hundreds of cards with two
// buttons each, and all of it is laid out on every keystroke in the search box.
const PAGE_SIZE = 50;

// The search survives leaving the page. Tapping a row to open a word is the usual
// way out, and coming back to an unfiltered list meant retyping the search every
// time you wanted to look at two words in a row.
//
// Module-level rather than a `?q=` URL param like KanjiList uses: mirroring it
// into the query string replaces the history entry on every keystroke, and
// react-router mints a fresh `location.key` for a REPLACE — which ScrollManager
// (App.tsx) reads as a new entry and scrolls to the top, taking the search box
// (below the add-word form) off screen mid-typing.
let lastSearch = "";

// Whether the "needs a translation" filter is on, kept across a visit for the
// same reason as the search: you fix these one at a time, and each fix means
// leaving the row.
let lastNeedsTranslation = false;

// Same again for the favourites filter.
let lastFavoritesOnly = false;

type SortKey = "newest" | "az" | "due";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "az", label: "A–Z" },
  { id: "due", label: "Due" },
];

let lastSort: SortKey = "newest";

// A never-practised word has no place on the due axis — the same rule the
// practice queue follows — so it sorts last rather than ahead of everything at
// time 0. (KanjiList does the same with kanji that have no date.) A *started*
// word with one unpractised direction keys at `now`, which is what
// `reviewDueKey` already returns for it.
const NEVER_PRACTISED = Number.MAX_SAFE_INTEGER;

const dueKey = (v: Vocab, now: number) =>
  isNew(v) ? NEVER_PRACTISED : reviewDueKey(v, now);

// "newest" is the list's own order, which is already newest-first: every path
// that adds a word prepends it. Sorting by `addedAt` instead would reshuffle
// every imported list, where the whole file shares one timestamp.
function sortWords(rows: Vocab[], key: SortKey): Vocab[] {
  if (key === "newest") return rows;
  const now = Date.now();
  // Array.sort is stable, so ties keep list order.
  return [...rows].sort(
    key === "az"
      ? // On the reading, so it comes out in kana order — sorting the written
        // form puts kanji in codepoint order, which is no order at all.
        (a, b) => (a.reading || a.word).localeCompare(b.reading || b.word, "ja")
      : (a, b) => dueKey(a, now) - dueKey(b, now),
  );
}

// A word can only be practised as a sentence if it has both an example sentence
// and a translation of it (see lib/sentenceSrs). Words from the reader arrive
// with a sentence and never a translation, so this is the gap that quietly keeps
// sentence practice empty — and there was no way to see which words were in it.
const needsTranslation = (v: Vocab) => !!v.example && !v.exampleEn;

export default function MyWords() {
  // Editing can start on the word page, which navigates here with the word's key
  // in the route state — the form lives here, so the page has to open with it
  // filled in. Read once, at mount; coming back with Back re-opens the same
  // edit, which is what the button did in the first place.
  const incoming = (useLocation().state as { editKey?: string } | null)?.editKey;
  const [initial] = useState(() =>
    incoming ? loadUserVocab().find((v) => keyOf(v) === incoming) : undefined,
  );

  const [list, setList] = useState<Vocab[]>(() => loadUserVocab());
  const [word, setWord] = useState(initial?.word ?? "");
  const [reading, setReading] = useState(initial?.reading ?? "");
  const [meanings, setMeanings] = useState(initial?.meanings.join(", ") ?? "");
  const [context, setContext] = useState(initial?.context ?? "");
  const [example, setExample] = useState(initial?.example ?? "");
  const [exampleEn, setExampleEn] = useState(initial?.exampleEn ?? "");
  const [editKey, setEditKey] = useState<string | null>(
    initial ? keyOf(initial) : null,
  );
  const [search, setSearch] = useState(lastSearch);
  const [untranslatedOnly, setUntranslatedOnly] = useState(lastNeedsTranslation);
  const [favoritesOnly, setFavoritesOnly] = useState(lastFavoritesOnly);
  const [sort, setSort] = useState<SortKey>(lastSort);
  const [shown, setShown] = useState(PAGE_SIZE);
  // My words is mostly a list you read, and the six fields push it below the
  // fold on a phone — collapsed, the card is a single row you tap to get back.
  // In settings rather than a module variable like the filters above, so it
  // survives a reload: a collapse that comes undone every time the app starts
  // isn't worth having.
  const [formOpen, setFormOpen] = useState(() => loadSettings().wordFormOpen);
  const formRef = useRef<HTMLFormElement>(null);

  // Editing forces the form open — it's the only editor there is — and finishing
  // the edit drops back to whatever you last chose, rather than leaving an empty
  // "Add a word" form standing open on a page you collapsed it on.
  const expanded = formOpen || editKey !== null;

  // Remembered for the next visit, like the search and the filters above.
  // Written in an effect rather than in the click handlers, where assigning a
  // module variable counts as a render side effect (react-hooks/globals).
  useEffect(() => {
    lastSort = sort;
  }, [sort]);

  // A new search starts from the top again — otherwise having expanded to 300
  // rows silently keeps that cost for every later search.
  const changeSearch = (value: string) => {
    lastSearch = value;
    setSearch(value);
    setShown(PAGE_SIZE);
  };

  const toggleUntranslated = () => {
    lastNeedsTranslation = !untranslatedOnly;
    setUntranslatedOnly(lastNeedsTranslation);
    setShown(PAGE_SIZE);
  };

  const toggleFavorites = () => {
    lastFavoritesOnly = !favoritesOnly;
    setFavoritesOnly(lastFavoritesOnly);
    setShown(PAGE_SIZE);
  };

  const persist = (next: Vocab[]) => {
    setList(next);
    saveUserVocab(next);
  };

  const resetForm = () => {
    setWord("");
    setReading("");
    setMeanings("");
    setContext("");
    setExample("");
    setExampleEn("");
    setEditKey(null);
  };

  const toggleForm = () => {
    // Collapsing mid-edit abandons it, the same as the Cancel button beside it.
    if (editKey) resetForm();
    const next = !expanded;
    setFormOpen(next);
    saveSettings({ ...loadSettings(), wordFormOpen: next });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = word.trim();
    if (!w) return;
    const r = reading.trim();

    const base = {
      word: w,
      reading: r,
      meanings: meanings
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      kanji: extractKanji(w),
      context: context.trim() || undefined,
      example: example.trim() || undefined,
      exampleEn: exampleEn.trim() || undefined,
    };
    const key = `${w}|${r}`;
    // The entry we're updating (when editing, or re-adding an existing key).
    const prev = list.find((v) => keyOf(v) === (editKey ?? key));

    const entry: Vocab = {
      ...base,
      addedAt: prev?.addedAt ?? Date.now(),
      // Carry review progress across an edit — fixing a typo or adding a note
      // must not reset the word's Leitner box, or its sentence's.
      srs: prev?.srs,
      sentenceSrs: prev?.sentenceSrs,
      favorite: prev?.favorite,
    };

    let next: Vocab[];
    if (editKey) {
      // Renaming a word onto another one's word+reading would leave two entries
      // sharing a key — which then grade together and collide as React keys. The
      // edited entry wins; the one it landed on is absorbed.
      next = list
        .filter((v) => keyOf(v) === editKey || keyOf(v) !== key)
        .map((v) => (keyOf(v) === editKey ? entry : v));
    } else if (prev) {
      next = list.map((v) => (keyOf(v) === key ? entry : v));
    } else {
      next = [entry, ...list];
    }
    persist(next);
    resetForm();
  };

  const toggleFavorite = (v: Vocab) => {
    persist(
      list.map((x) =>
        keyOf(x) === keyOf(v) ? { ...x, favorite: !x.favorite || undefined } : x,
      ),
    );
  };

  const handleEdit = (v: Vocab) => {
    setWord(v.word);
    setReading(v.reading);
    setMeanings(v.meanings.join(", "));
    setContext(v.context ?? "");
    setExample(v.example ?? "");
    setExampleEn(v.exampleEn ?? "");
    setEditKey(keyOf(v));
    // The form is at the top of the page and the row you tapped may be hundreds
    // down. Without this, Edit looks like it did nothing at all — doubly so now
    // that the form can be collapsed.
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Confirmed because Delete sits directly beside Edit on every row, so a
  // mis-tap on a phone destroys the word *and* its review history with nothing
  // to undo it. Names the word rather than asking "are you sure?" — the point is
  // to show which row is about to go, since the mis-tap is usually the wrong row
  // rather than the wrong button.
  const handleDelete = (v: Vocab) => {
    const label = v.reading ? `${v.word} (${v.reading})` : v.word;
    if (!confirm(`Delete ${label}?\n\nIts review progress goes with it.`)) return;
    persist(list.filter((x) => keyOf(x) !== keyOf(v)));
    if (editKey === keyOf(v)) resetForm();
  };

  // Ambiguity/synonym detection: existing words that share this one's reading or
  // an English meaning (so the user can add a nuance hint to tell them apart).
  const collisions = useMemo(() => {
    const r = reading.trim();
    const ms = meanings
      .split(",")
      .map((m) => m.trim().toLowerCase())
      .filter(Boolean);
    if (!r && ms.length === 0) return [];

    const currentKey = `${word.trim()}|${r}`;
    return list.filter((v) => {
      const vk = keyOf(v);
      if (vk === editKey || vk === currentKey) return false;
      const readingClash = !!r && v.reading.trim() === r;
      const meaningClash = v.meanings.some((m) =>
        ms.includes(m.trim().toLowerCase()),
      );
      return readingClash || meaningClash;
    });
  }, [list, word, reading, meanings, editKey]);

  const untranslatedCount = useMemo(
    () => list.filter(needsTranslation).length,
    [list],
  );

  const favoriteCount = useMemo(
    () => list.filter((v) => v.favorite).length,
    [list],
  );

  // One flattened, lowercased string per word, including the reading in romaji —
  // so "nihon" finds 日本, as it already does on the kanji list. Built once per
  // list change rather than per keystroke: the romaji conversion is the expensive
  // part, and that is exactly the mistake KanjiList had to fix.
  const searchIndex = useMemo(
    () =>
      list.map((v) => ({
        v,
        text: [
          v.word,
          v.reading,
          wanakana.toRomaji(v.reading),
          ...v.meanings,
          v.context ?? "",
          v.example ?? "",
          v.exampleEn ?? "",
        ]
          .join(" ")
          .toLowerCase(),
      })),
    [list],
  );

  const filtered = useMemo(() => {
    let base = searchIndex;
    if (untranslatedOnly) base = base.filter(({ v }) => needsTranslation(v));
    if (favoritesOnly) base = base.filter(({ v }) => v.favorite);
    const t = search.trim().toLowerCase();
    if (t) base = base.filter(({ text }) => text.includes(t));
    return sortWords(base.map(({ v }) => v), sort);
  }, [searchIndex, search, untranslatedOnly, favoritesOnly, sort]);

  const narrowed = search.trim() !== "" || untranslatedOnly || favoritesOnly;

  return (
    <div className="page">
      <h1 className="page-title">My words</h1>

      <form
        ref={formRef}
        className={`mw-form surface-card${expanded ? "" : " mw-form-collapsed"}`}
        onSubmit={handleSubmit}
      >
        <button
          type="button"
          className="mw-form-toggle"
          onClick={toggleForm}
          aria-expanded={expanded}
        >
          <strong>{editKey ? "Edit word" : "Add a word"}</strong>
          <span className="mw-form-chevron" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
        </button>

        {expanded && (
          <>
            <div className="mw-fields">
              <ClearableField show={word.length > 0} onClear={() => setWord("")} label="Clear word">
                <input
                  className="mw-input"
                  placeholder="Word (e.g. 日本)"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                />
              </ClearableField>
              <ClearableField show={reading.length > 0} onClear={() => setReading("")} label="Clear reading">
                <input
                  className="mw-input"
                  placeholder="Reading (e.g. にほん)"
                  value={reading}
                  onChange={(e) => setReading(e.target.value)}
                />
              </ClearableField>
              <ClearableField show={meanings.length > 0} onClear={() => setMeanings("")} label="Clear meanings">
                <input
                  className="mw-input"
                  placeholder="Meanings, comma-separated (e.g. Japan)"
                  value={meanings}
                  onChange={(e) => setMeanings(e.target.value)}
                />
              </ClearableField>
              <ClearableField
                show={context.length > 0}
                onClear={() => setContext("")}
                align="top"
                label="Clear context"
              >
                <textarea
                  className="mw-input mw-context"
                  rows={2}
                  placeholder="Context / notes (optional)"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                />
              </ClearableField>
              <ClearableField
                show={example.length > 0}
                onClear={() => setExample("")}
                align="top"
                label="Clear example sentence"
              >
                <textarea
                  className="mw-input mw-context"
                  rows={2}
                  placeholder="Example sentence (optional)"
                  value={example}
                  onChange={(e) => setExample(e.target.value)}
                />
              </ClearableField>
              <ClearableField
                show={exampleEn.length > 0}
                onClear={() => setExampleEn("")}
                align="top"
                label="Clear example translation"
              >
                <textarea
                  className="mw-input mw-context"
                  rows={2}
                  placeholder="Example sentence translation (optional)"
                  value={exampleEn}
                  onChange={(e) => setExampleEn(e.target.value)}
                />
              </ClearableField>
            </div>

            {word.trim() && (
              <p className="mw-derived">
                Kanji: {extractKanji(word).join(" ") || "— (no kanji; always available)"}
              </p>
            )}

            {collisions.length > 0 && (
              <p className="mw-warning">
                ⚠ You already have{" "}
                {collisions
                  .slice(0, 3)
                  .map((v) => v.word + (v.reading ? ` (${v.reading})` : ""))
                  .join(", ")}
                {collisions.length > 3 ? ", …" : ""} with the same reading or meaning
                — add a context note to tell them apart.
              </p>
            )}

            <div className="mw-form-actions">
              <button type="submit" className="mw-button mw-button-primary">
                {editKey ? "Save" : "Add word"}
              </button>
              {editKey && (
                <button type="button" className="mw-button" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
      </form>

      <div className="mw-list-header">
        <ClearableField
          className="mw-search-wrap"
          show={search.length > 0}
          onClear={() => changeSearch("")}
          label="Clear search"
        >
          <input
            className="mw-search"
            placeholder="Search your words…"
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
          />
        </ClearableField>
        {/* While narrowed, the matching count is the useful number — the total
            is kept alongside it so the list size doesn't appear to have changed. */}
        <span className="mw-count">
          {narrowed
            ? `${filtered.length} of ${list.length} words`
            : `${list.length} words`}
        </span>

        {/* The chips are one item of the header row, so a narrow screen wraps
            them onto a line of their own rather than stranding one below the
            other. Each is shown while its filter is on even at zero, so clearing
            the last match leaves a way back rather than an empty list and no
            visible filter. */}
        {(untranslatedCount > 0 ||
          untranslatedOnly ||
          favoriteCount > 0 ||
          favoritesOnly) && (
          <div className="mw-filters">
            {(untranslatedCount > 0 || untranslatedOnly) && (
              <button
                type="button"
                className={`mw-filter${untranslatedOnly ? " active" : ""}`}
                onClick={toggleUntranslated}
                aria-pressed={untranslatedOnly}
              >
                {untranslatedCount} need a translation
              </button>
            )}

            {(favoriteCount > 0 || favoritesOnly) && (
              <button
                type="button"
                className={`mw-filter${favoritesOnly ? " active" : ""}`}
                onClick={toggleFavorites}
                aria-pressed={favoritesOnly}
              >
                ★ {favoriteCount} favourites
              </button>
            )}
          </div>
        )}
      </div>

      {list.length > 1 && (
        <div className="mw-sort" role="group" aria-label="Sort">
          <div className="scope-tabs">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`scope-tab${sort === s.id ? " active" : ""}`}
                onClick={() => setSort(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="mw-empty">
          No words yet. Add your first word above, or import a vocab.json file.
        </p>
      ) : (
        <div className="mw-list">
          {filtered.slice(0, shown).map((v) => (
            <div className="mw-item surface-card" key={keyOf(v)}>
              <Link
                className="mw-item-body"
                to={`/word/${encodeURIComponent(keyOf(v))}`}
              >
                <div className="mw-item-main">
                  <span className="mw-word" lang="ja">{v.word}</span>
                  {v.reading && <span className="mw-reading" lang="ja">{v.reading}</span>}
                  <span className="mw-meaning">{v.meanings.join(", ")}</span>
                </div>
                {v.context && <p className="mw-item-context">{v.context}</p>}
              </Link>
              <div className="mw-item-actions">
                <button
                  className={`mw-icon-button mw-star${v.favorite ? " active" : ""}`}
                  onClick={() => toggleFavorite(v)}
                  aria-pressed={!!v.favorite}
                  aria-label={v.favorite ? "Remove from favourites" : "Add to favourites"}
                >
                  {v.favorite ? "★" : "☆"}
                </button>
                <button className="mw-icon-button" onClick={() => handleEdit(v)}>
                  Edit
                </button>
                <button
                  className="mw-icon-button mw-delete"
                  onClick={() => handleDelete(v)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {filtered.length > shown && (
            <button
              type="button"
              className="mw-button mw-show-more"
              onClick={() => setShown((n) => n + PAGE_SIZE)}
            >
              Show more ({filtered.length - shown} left)
            </button>
          )}

          {filtered.length === 0 && (
            <p className="mw-empty">
              {favoritesOnly && !untranslatedOnly && !search.trim()
                ? "No favourites yet — tap ☆ on a word to add one."
                : untranslatedOnly && !search.trim()
                  ? "Every word with a sentence has a translation. ✓"
                  : `No words match “${search}”.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
