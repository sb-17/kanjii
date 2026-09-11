import { useEffect, useState } from "react";
import "./WordSuggestions.css";
import type { Vocab } from "../../types/vocabType";
import { useProgress } from "../../context/ProgressContext";
import { loadUserVocab, saveUserVocab } from "../../storage/userVocab";
import { extractKanji } from "../../lib/vocab";
import { suggestWords, type WordSuggestion } from "../../lib/wordSuggest";

// Rows offered at once. The fetch asks for several times this so that adding a
// word can pull the next one up rather than shrinking the list.
const SHOWN = 6;

// Pick a real word that uses this kanji, instead of typing one from memory.
// Shared by the kanji page and the last step of the guided flow — adding a word
// is one operation, so the save lives here rather than in each caller.
export default function WordSuggestions({
  char,
  onAdd,
}: {
  char: string;
  onAdd?: (word: Vocab) => void;
}) {
  const { progress } = useProgress();
  // More candidates are fetched than are shown, so adding one can drop it and
  // reveal the next instead of leaving a gap. A word you've added belongs in the
  // list above, not still sitting here offering itself.
  const [pool, setPool] = useState<WordSuggestion[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setPool(null);
    setFailed(false);
    // Words already in the list are excluded rather than shown as duplicates.
    const have = new Set(loadUserVocab().map((v) => v.word));
    suggestWords(char, progress, have, SHOWN * 3)
      .then((s) => alive && setPool(s))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // `progress` only reorders the list; re-running on every status change while
    // this is open would be churn for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char]);

  const add = (s: WordSuggestion) => {
    const entry: Vocab = {
      word: s.word,
      reading: s.reading,
      meanings: s.meanings,
      kanji: extractKanji(s.word),
      addedAt: Date.now(),
    };
    // Re-read rather than trusting a snapshot: another page may have written to
    // the same store since this mounted. Prepended, like every other add path —
    // My words sorts on array order by default, so that is the order you see.
    const list = loadUserVocab();
    if (!list.some((v) => v.word === entry.word && v.reading === entry.reading)) {
      saveUserVocab([entry, ...list]);
    }
    // Drop it here and let the next candidate take its place, so the list keeps
    // its length and never disagrees with what a reload would show.
    setPool((prev) => prev?.filter((x) => x.word !== s.word) ?? prev);
    onAdd?.(entry);
  };

  if (failed) return null;

  if (pool === null) {
    return <p className="ws-status">Looking for words…</p>;
  }

  const items = pool.slice(0, SHOWN);

  // Reachable by adding the last one, not just by opening a kanji with no
  // entries — so it can't say "below", which only exists in the guided flow.
  if (items.length === 0) {
    return <p className="ws-status">No more dictionary words for this kanji.</p>;
  }

  return (
    <ul className="ws-list">
      {items.map((s) => (
        <li className="ws-item" key={s.word}>
          <span className="ws-text">
            <span className="ws-word" lang="ja">
              {s.word}
            </span>
            {s.reading && s.reading !== s.word && (
              <span className="ws-reading" lang="ja">
                {s.reading}
              </span>
            )}
            <span className="ws-meaning">{s.meanings.slice(0, 3).join(", ")}</span>
          </span>
          <button type="button" className="ws-add" onClick={() => add(s)}>
            Add
          </button>
        </li>
      ))}
    </ul>
  );
}
