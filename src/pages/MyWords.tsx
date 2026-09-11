import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/MyWords.css";
import type { Vocab } from "../types/vocabType";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { extractKanji } from "../lib/vocab";
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

// A word can only be practised as a sentence if it has both an example sentence
// and a translation of it (see lib/sentenceSrs). Words from the reader arrive
// with a sentence and never a translation, so this is the gap that quietly keeps
// sentence practice empty — and there was no way to see which words were in it.
const needsTranslation = (v: Vocab) => !!v.example && !v.exampleEn;

export default function MyWords() {
  const [list, setList] = useState<Vocab[]>(() => loadUserVocab());
  const [word, setWord] = useState("");
  const [reading, setReading] = useState("");
  const [meanings, setMeanings] = useState("");
  const [context, setContext] = useState("");
  const [example, setExample] = useState("");
  const [exampleEn, setExampleEn] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [search, setSearch] = useState(lastSearch);
  const [untranslatedOnly, setUntranslatedOnly] = useState(lastNeedsTranslation);
  const [favoritesOnly, setFavoritesOnly] = useState(lastFavoritesOnly);
  const [shown, setShown] = useState(PAGE_SIZE);

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

  const filtered = useMemo(() => {
    let base = untranslatedOnly ? list.filter(needsTranslation) : list;
    if (favoritesOnly) base = base.filter((v) => v.favorite);
    const t = search.trim().toLowerCase();
    if (!t) return base;
    return base.filter(
      (v) =>
        v.word.toLowerCase().includes(t) ||
        v.reading.toLowerCase().includes(t) ||
        v.meanings.some((m) => m.toLowerCase().includes(t)) ||
        (v.context ?? "").toLowerCase().includes(t) ||
        (v.example ?? "").toLowerCase().includes(t) ||
        (v.exampleEn ?? "").toLowerCase().includes(t),
    );
  }, [list, search, untranslatedOnly, favoritesOnly]);

  const narrowed = search.trim() !== "" || untranslatedOnly || favoritesOnly;

  return (
    <div className="page">
      <h1 className="page-title">My words</h1>

      <form className="mw-form surface-card" onSubmit={handleSubmit}>
        <strong>{editKey ? "Edit word" : "Add a word"}</strong>
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

        {/* Shown while it's on even at zero, so clearing the last one leaves a
            way back rather than an empty list and no visible filter. */}
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
