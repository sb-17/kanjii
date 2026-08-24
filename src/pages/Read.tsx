import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ClearableField from "../components/clearable-field/ClearableField";
import { useProgress } from "../context/ProgressContext";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { extractWords, makeDictionary } from "../lib/textExtract";
import type { Dictionary, DictionaryData, FoundWord } from "../lib/textExtract";
import type { Vocab } from "../types/vocabType";
import "../styles/Read.css";

// Paste real Japanese and get the words out of it, each shown against your own
// kanji tags, ready to add to My Words.
//
// The kanji chips are the point. A dictionary can tell anyone what 図書館 means;
// only this app can say the word is hard *for you* because 館 is still untagged.
// That's why every row carries them and why they link through to the kanji page.

const SCOPES = [
  { id: "all", label: "All" },
  { id: "new", label: "Not added" },
  { id: "unknown", label: "Unknown kanji" },
] as const;

type Scope = (typeof SCOPES)[number]["id"];

export default function Read() {
  const { progress } = useProgress();
  const [text, setText] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [vocab, setVocab] = useState<Vocab[]>(loadUserVocab);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // The word list is ~424 KB, so it is fetched on demand rather than imported.
  // This page's own code is tiny and ships in the main bundle; anyone who never
  // opens Read pays nothing for the dictionary.
  useEffect(() => {
    let alive = true;
    void import("../data/dictionary.json")
      .then((m) => {
        // Through `unknown`: TypeScript infers the JSON's [string, string[]]
        // pairs as (string | string[])[], which is not assignable to a tuple.
        if (alive) setDict(makeDictionary(m.default as unknown as DictionaryData));
      })
      .catch(() => {
        if (alive) setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Scanning a long paste is tens of milliseconds, which is enough to make
  // typing feel sticky. Deferring keeps the textarea responsive and lets React
  // drop intermediate results while you are still typing.
  const deferredText = useDeferredValue(text);
  const words = useMemo(
    () => (dict && deferredText.trim() ? extractWords(deferredText, dict) : []),
    [deferredText, dict],
  );

  // Matched on the word alone, not word+reading. If you already have 义 under a
  // different reading you still don't want the reader offering it again — and
  // the dictionary only carries one reading per spelling anyway.
  const have = useMemo(() => new Set(vocab.map((v) => v.word)), [vocab]);

  const isUnknown = (w: FoundWord) =>
    w.kanji.some((ch) => (progress[ch] ?? "new") !== "known");

  const shown = useMemo(
    () =>
      words.filter((w) =>
        scope === "new" ? !have.has(w.word) : scope === "unknown" ? isUnknown(w) : true,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words, scope, have, progress],
  );

  const add = (w: FoundWord) => {
    // Re-read rather than trusting state: Practice or a restore may have written
    // to the same store since this page mounted.
    const list = loadUserVocab();
    if (list.some((v) => v.word === w.word)) {
      setVocab(list);
      return;
    }
    // Newest first, matching MyWords and KanjiLearn. My words has no sort
    // control, so array order is display order — appending hid a word you just
    // added behind everything you already had.
    const next: Vocab[] = [
      {
        word: w.word,
        reading: w.reading,
        meanings: w.meanings,
        kanji: w.kanji,
        // The sentence you met it in, not a note you wrote — hence `example`.
        example: w.sentence,
        addedAt: Date.now(),
      },
      ...list,
    ];
    saveUserVocab(next);
    setVocab(next);
  };

  const pending = Boolean(text.trim()) && !dict && !loadFailed;
  const unsaved = words.filter((w) => !have.has(w.word)).length;

  return (
    <div className="page">
      <h1 className="page-title">Read</h1>
      <p className="read-intro">
        Paste Japanese text to see the words in it, checked against the kanji you
        already know.
      </p>

      <ClearableField
        show={text.length > 0}
        onClear={() => setText("")}
        align="top"
        label="Clear text"
      >
        <textarea
          className="read-input"
          rows={5}
          placeholder="Paste Japanese text here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </ClearableField>

      {loadFailed && (
        <p className="read-status read-status-error">
          Couldn't load the word list. Check you're online and reload — it's
          cached for offline use once fetched.
        </p>
      )}
      {pending && <p className="read-status">Loading the word list…</p>}
      {!pending && !loadFailed && text.trim() && (
        <p className="read-status">
          {words.length === 0
            ? "No words found. Is the text Japanese?"
            : `${words.length} word${words.length === 1 ? "" : "s"} · ${unsaved} not in My words`}
        </p>
      )}

      {words.length > 0 && (
        <div className="scope-tabs">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              className={`scope-tab${scope === s.id ? " active" : ""}`}
              onClick={() => setScope(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {words.length > 0 && shown.length === 0 && (
        <p className="read-status">Nothing in this filter.</p>
      )}

      <div className="read-list">
        {shown.map((w) => (
          <div key={w.word} className="read-row surface-card">
            <div className="read-row-head">
              <span className="read-word" lang="ja">{w.word}</span>
              <span className="read-reading" lang="ja">{w.reading}</span>
              {w.surface !== w.word && (
                <span className="read-surface">
                  as <span lang="ja">{w.surface}</span>
                </span>
              )}
              {w.count > 1 && <span className="read-count">×{w.count}</span>}
            </div>

            <p className="read-meaning">{w.meanings.join("; ")}</p>

            <div className="read-row-foot">
              <div className="read-kanji">
                {w.kanji.map((ch) => (
                  <Link
                    key={ch}
                    to={`/kanji/${encodeURIComponent(ch)}`}
                    className={`read-kanji-chip status-${progress[ch] ?? "new"}`}
                    lang="ja"
                  >
                    {ch}
                  </Link>
                ))}
              </div>

              {have.has(w.word) ? (
                <span className="read-have">✓ In My words</span>
              ) : (
                <button className="read-add" onClick={() => add(w)}>
                  + Add
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
