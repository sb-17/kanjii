import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import "../styles/KanjiLearn.css";
import type { Vocab } from "../types/vocabType";
import { getKanji } from "../lib/kanjiIndex";
import { useProgress } from "../context/ProgressContext";
import { loadKanjiStrokes } from "../lib/kanjiVg";
import { extractKanji } from "../lib/vocab";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { loadKanjiSkill, updateKanjiSkill } from "../storage/kanjiSkill";
import { classifyWrite, gradeSkill, isSkillDue } from "../lib/kanjiSkill";
import { logWrite } from "../storage/events";
import KanjiStrokeViewer from "../components/kanji-stroke-viewer/KanjiStrokeViewer";
import KanjiWriter, {
  type WriteResult,
} from "../components/kanji-writer/KanjiWriter";
import ClearableField from "../components/clearable-field/ClearableField";
import EmptyState from "../components/empty-state/EmptyState";

// A guided first encounter with one kanji, in order: see it, see how it's built
// stroke by stroke, write it, then attach sound and a word of your own to it.
// Readings come *after* the writing so the shape is learned on its own terms —
// and the word last, because a kanji you can't use in a word isn't learned yet.
//
// A components/radicals step would sit between "strokes" and "write". Considered
// and decided against — the writing reps already teach the chunking (see ROADMAP,
// "Considered and parked").
const STEPS = ["meaning", "strokes", "write", "readings", "word"] as const;
type Step = (typeof STEPS)[number];

// Trace once to learn where the strokes go, then produce it twice unaided. The
// traced rep is deliberately first and only once — tracing teaches the motion,
// but only writing from memory is evidence of anything.
const WRITE_REPS = 3;
const GUIDED_REPS = 1;

const keyOf = (v: Vocab) => `${v.word}|${v.reading}`;

export default function KanjiLearn() {
  const { char = "" } = useParams<{ char: string }>();
  const navigate = useNavigate();
  const { progress, setStatus } = useProgress();

  const [stepIndex, setStepIndex] = useState(0);
  const [rep, setRep] = useState(0);

  const [word, setWord] = useState("");
  const [reading, setReading] = useState("");
  const [meanings, setMeanings] = useState("");
  const [wordError, setWordError] = useState("");
  const [savedWord, setSavedWord] = useState<Vocab | null>(null);
  // Kept local so the end-of-session suggestion disappears once it's answered.
  const [promoted, setPromoted] = useState(false);

  // Stroke data is fetched at runtime and only Learning/Known kanji are warmed at
  // boot — a brand-new kanji opened offline can legitimately come back with none.
  // The write step can't be skipped, so it has to know: null = still loading.
  const [strokeCount, setStrokeCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    loadKanjiStrokes(char).then((s) => {
      if (active) setStrokeCount(s.length);
    });
    return () => {
      active = false;
    };
  }, [char]);

  const kanjiObj = getKanji(char);
  if (!kanjiObj) {
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

  const step: Step | "done" =
    stepIndex < STEPS.length ? STEPS[stepIndex] : "done";
  const next = () => setStepIndex((i) => i + 1);

  // Record the attempt exactly as the standalone Write page does — same log, same
  // skill grading — so a kanji met here isn't a hole in the handwriting history.
  // The traced rep classifies as "practice" and never advances the box.
  const handleWriteComplete = (r: WriteResult) => {
    const guided = rep < GUIDED_REPS;
    logWrite({ c: char, n: r.strokes, m: r.misses, h: r.hints, g: guided, ms: r.ms });

    const at = Date.now();
    const prev = loadKanjiSkill()[char];
    const outcome = classifyWrite({
      guide: guided,
      strokes: r.strokes,
      misses: r.misses,
      hints: r.hints,
    });
    // Same due-gate as /write: extra reps while ahead of schedule are practice,
    // not levels — three writes in one session shouldn't be three promotions.
    const effective =
      outcome === "promote" && !isSkillDue(prev, at) ? "practice" : outcome;
    const nextSkill = gradeSkill(prev, effective, at);
    if (nextSkill !== prev) updateKanjiSkill(char, nextSkill);

    if (rep + 1 < WRITE_REPS) setRep(rep + 1);
    else next();
  };

  const handleAddWord = (e: React.FormEvent) => {
    e.preventDefault();
    const w = word.trim();
    if (!w) return;
    if (!w.includes(char)) {
      setWordError(`That word doesn't contain ${char}.`);
      return;
    }

    const r = reading.trim();
    const key = `${w}|${r}`;
    const list = loadUserVocab();
    const prev = list.find((v) => keyOf(v) === key);
    const entry: Vocab = {
      word: w,
      reading: r,
      meanings: meanings
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      kanji: extractKanji(w),
      // Naming a word you already have is a fine answer — update it in place
      // rather than duplicating, and never reset its review progress.
      context: prev?.context,
      example: prev?.example,
      addedAt: prev?.addedAt ?? Date.now(),
      srs: prev?.srs,
    };

    saveUserVocab(
      prev ? list.map((v) => (keyOf(v) === key ? entry : v)) : [entry, ...list],
    );
    setSavedWord(entry);
    next();
  };

  const heading =
    step === "meaning"
      ? "Meet the kanji"
      : step === "strokes"
        ? "How it's written"
        : step === "write"
          ? rep < GUIDED_REPS
            ? "Trace it"
            : "Write it from memory"
          : step === "readings"
            ? "How it's read"
            : step === "word"
              ? "Add a word you'd use it in"
              : "Done";

  return (
    <div className="page kl-page">
      <button type="button" className="kl-back" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <div className="kl-header">
        <h1 className="kl-heading">{heading}</h1>
        <div className="kl-pips" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={`kl-pip${i <= stepIndex ? " filled" : ""}`} />
          ))}
        </div>
      </div>

      {step === "meaning" && (
        <div className="kl-step kl-step-center">
          <div className="kl-char">{kanjiObj.character}</div>
          <p className="kl-meanings">{kanjiObj.meanings.join(", ")}</p>
          <p className="kl-facts">
            {kanjiObj.strokes} strokes
            {kanjiObj.frequency ? ` · #${kanjiObj.frequency} most common` : ""}
          </p>
          <p className="kl-sub">
            Look at it properly — you'll be writing it from memory in a moment.
          </p>
          <div className="kl-actions">
            <button className="kl-button kl-button-primary" onClick={next}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === "strokes" && (
        <div className="kl-step kl-step-center">
          <KanjiStrokeViewer kanji={kanjiObj.character} />
          <p className="kl-sub">
            Each frame adds one stroke; the dot marks where it starts.
          </p>
          <div className="kl-actions">
            <button className="kl-button kl-button-primary" onClick={next}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === "write" && (
        <div className="kl-step kl-step-center">
          <p className="kl-write-prompt">
            <strong>{kanjiObj.meanings.join(", ")}</strong>
            <span className="kl-rep">
              {" "}
              — rep {rep + 1} of {WRITE_REPS}
            </span>
          </p>

          {strokeCount === 0 ? (
            // No stroke data (offline, first visit): don't dead-end the session.
            <>
              <p className="kl-sub">
                Stroke data for {kanjiObj.character} isn't available offline yet.
                Write it on paper instead, then carry on.
              </p>
              <div className="kl-actions">
                <button className="kl-button kl-button-primary" onClick={next}>
                  Next
                </button>
              </div>
            </>
          ) : (
            <KanjiWriter
              key={`${char}-${rep}`}
              kanji={kanjiObj.character}
              guide={rep < GUIDED_REPS}
              onComplete={handleWriteComplete}
            />
          )}
        </div>
      )}

      {step === "readings" && (
        <div className="kl-step">
          <div className="kl-readings surface-card">
            <div className="kl-reading-row">
              <span className="kl-reading-label">Onyomi</span>
              <span className="kl-reading-values">
                {kanjiObj.on.length > 0 ? kanjiObj.on.join("、") : "—"}
              </span>
            </div>
            <div className="kl-reading-row">
              <span className="kl-reading-label">Kunyomi</span>
              <span className="kl-reading-values">
                {kanjiObj.kun.length > 0 ? kanjiObj.kun.join("、") : "—"}
              </span>
            </div>
          </div>
          <p className="kl-sub">
            Onyomi mostly shows up in compounds, kunyomi when the kanji stands on
            its own — the word you add next will use one of them.
          </p>
          <div className="kl-actions">
            <button className="kl-button kl-button-primary" onClick={next}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === "word" && (
        <form className="kl-step kl-form surface-card" onSubmit={handleAddWord}>
          <p className="kl-sub">
            One word containing {kanjiObj.character}, in your own words. It goes
            straight into My words, so it'll come back in practice.
          </p>
          <div className="kl-fields">
            <ClearableField
              show={word.length > 0}
              onClear={() => setWord("")}
              label="Clear word"
            >
              <input
                className="kl-input"
                placeholder={`Word containing ${kanjiObj.character}`}
                value={word}
                onChange={(e) => {
                  setWord(e.target.value);
                  setWordError("");
                }}
              />
            </ClearableField>
            <ClearableField
              show={reading.length > 0}
              onClear={() => setReading("")}
              label="Clear reading"
            >
              <input
                className="kl-input"
                placeholder="Reading (optional)"
                value={reading}
                onChange={(e) => setReading(e.target.value)}
              />
            </ClearableField>
            <ClearableField
              show={meanings.length > 0}
              onClear={() => setMeanings("")}
              label="Clear meanings"
            >
              <input
                className="kl-input"
                placeholder="Meanings, comma-separated (optional)"
                value={meanings}
                onChange={(e) => setMeanings(e.target.value)}
              />
            </ClearableField>
          </div>

          {wordError && <p className="kl-error">{wordError}</p>}

          <div className="kl-actions">
            <button
              type="submit"
              className="kl-button kl-button-primary"
              disabled={!word.trim()}
            >
              Add word and finish
            </button>
          </div>
        </form>
      )}

      {step === "done" && (
        <div className="kl-step kl-step-center">
          <div className="kl-char kl-char-small">{kanjiObj.character}</div>
          {savedWord && (
            <p className="kl-done-word">
              Added <strong>{savedWord.word}</strong>
              {savedWord.reading ? ` (${savedWord.reading})` : ""} to your words.
            </p>
          )}

          {/* Suggest, never set: status tags stay the learner's call. */}
          {progress[kanjiObj.character] !== "learning" &&
            progress[kanjiObj.character] !== "known" &&
            !promoted && (
              <div className="kl-suggest surface-card">
                <p className="kl-suggest-text">
                  Mark {kanjiObj.character} as Learning so it starts coming up in
                  practice?
                </p>
                <div className="kl-actions">
                  <button
                    className="kl-button kl-button-primary"
                    onClick={() => {
                      setStatus(kanjiObj.character, "learning");
                      setPromoted(true);
                    }}
                  >
                    Mark Learning
                  </button>
                  <button className="kl-button" onClick={() => setPromoted(true)}>
                    Not now
                  </button>
                </div>
              </div>
            )}

          <div className="kl-actions">
            <Link
              className="kl-button"
              to={`/kanji/${encodeURIComponent(kanjiObj.character)}`}
            >
              Back to {kanjiObj.character}
            </Link>
            <Link
              className="kl-button"
              to={`/kanji/${encodeURIComponent(kanjiObj.character)}/write`}
            >
              ✏️ Keep writing
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
