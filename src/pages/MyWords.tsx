import { useMemo, useState } from "react";
import "../styles/MyWords.css";
import type { Vocab } from "../types/vocabType";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { extractKanji } from "../lib/vocab";

const keyOf = (v: Vocab) => `${v.word}|${v.reading}`;

export default function MyWords() {
  const [list, setList] = useState<Vocab[]>(() => loadUserVocab());
  const [word, setWord] = useState("");
  const [reading, setReading] = useState("");
  const [meanings, setMeanings] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const persist = (next: Vocab[]) => {
    setList(next);
    saveUserVocab(next);
  };

  const resetForm = () => {
    setWord("");
    setReading("");
    setMeanings("");
    setEditKey(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = word.trim();
    if (!w) return;

    const entry: Vocab = {
      word: w,
      reading: reading.trim(),
      meanings: meanings
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      kanji: extractKanji(w),
    };
    const key = keyOf(entry);

    let next: Vocab[];
    if (editKey) {
      next = list.map((v) => (keyOf(v) === editKey ? entry : v));
    } else if (list.some((v) => keyOf(v) === key)) {
      next = list.map((v) => (keyOf(v) === key ? entry : v));
    } else {
      next = [entry, ...list];
    }
    persist(next);
    resetForm();
  };

  const handleEdit = (v: Vocab) => {
    setWord(v.word);
    setReading(v.reading);
    setMeanings(v.meanings.join(", "));
    setEditKey(keyOf(v));
  };

  const handleDelete = (v: Vocab) => {
    persist(list.filter((x) => keyOf(x) !== keyOf(v)));
    if (editKey === keyOf(v)) resetForm();
  };

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return list;
    return list.filter(
      (v) =>
        v.word.toLowerCase().includes(t) ||
        v.reading.toLowerCase().includes(t) ||
        v.meanings.some((m) => m.toLowerCase().includes(t)),
    );
  }, [list, search]);

  return (
    <div className="page">
      <h1 className="page-title">My words</h1>

      <form className="mw-form surface-card" onSubmit={handleSubmit}>
        <strong>{editKey ? "Edit word" : "Add a word"}</strong>
        <div className="mw-fields">
          <input
            className="mw-input"
            placeholder="Word (e.g. 日本)"
            value={word}
            onChange={(e) => setWord(e.target.value)}
          />
          <input
            className="mw-input"
            placeholder="Reading (e.g. にほん)"
            value={reading}
            onChange={(e) => setReading(e.target.value)}
          />
          <input
            className="mw-input"
            placeholder="Meanings, comma-separated (e.g. Japan)"
            value={meanings}
            onChange={(e) => setMeanings(e.target.value)}
          />
        </div>
        {word.trim() && (
          <p className="mw-derived">
            Kanji: {extractKanji(word).join(" ") || "— (no kanji; always available)"}
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
        <input
          className="mw-search"
          placeholder="Search your words…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="mw-count">{list.length} words</span>
      </div>

      {list.length === 0 ? (
        <p className="mw-empty">
          No words yet. Add your first word above, or import a vocab.json file.
        </p>
      ) : (
        <div className="mw-list">
          {filtered.map((v) => (
            <div className="mw-item surface-card" key={keyOf(v)}>
              <div className="mw-item-main">
                <span className="mw-word">{v.word}</span>
                {v.reading && <span className="mw-reading">{v.reading}</span>}
                <span className="mw-meaning">{v.meanings.join(", ")}</span>
              </div>
              <div className="mw-item-actions">
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
        </div>
      )}
    </div>
  );
}
