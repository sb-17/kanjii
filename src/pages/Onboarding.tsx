import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProgress } from "../context/ProgressContext";
import { loadSettings, saveSettings } from "../storage/settings";
import { ALL_KANJI } from "../lib/kanjiIndex";
import "../styles/Onboarding.css";

// First-run setup: tell Kanjii which kanji you already read, so everything that
// keys off status has something to work with on day one.
//
// A grid, not a one-at-a-time quiz. Sequential asking costs a tap per kanji, so
// its length scales with how much you know — a beginner finishes in seconds and
// someone with 1,500 kanji never does, which is backwards. Tapping only what you
// recognise out of a screen of 30 takes about the same time either way.
//
// **Untapped means `new`, and that asymmetry is the point.** A kanji you know but
// didn't tap merely gets offered for study — a second's annoyance. One wrongly
// marked Known is invisible: it silently never comes up again. So nothing here
// infers. Bulk-marking everything below a probed "frontier" would be far faster
// and is exactly the shortcut that would corrupt the dataset the app rests on.

const BATCH = 30;

// Under this many recognised in a batch, we assume the frequency list has run
// past what you know and offer to stop. Only an offer — you can keep going.
const STOP_BELOW = 3;

export default function Onboarding() {
  const navigate = useNavigate();
  const { progress, replaceProgress } = useProgress();

  // Frequency order, commonest first, skipping the ~97 kanji with no rank —
  // they're the rarest in the set and pointless to ask about first.
  const pool = useMemo(
    () =>
      ALL_KANJI.filter((k) => k.frequency).sort(
        (a, b) => (a.frequency ?? 0) - (b.frequency ?? 0),
      ),
    [],
  );

  const [start, setStart] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tagged, setTagged] = useState(0);
  const [finished, setFinished] = useState(false);

  const batch = pool.slice(start, start + BATCH);
  const atEnd = start + BATCH >= pool.length;

  const toggle = (ch: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });
  };

  // Written once per batch rather than once at the end, so abandoning the flow
  // halfway keeps what you already answered.
  //
  // replaceProgress, not setStatus per kanji: setStatus logs a status event each
  // time, and a few hundred of those would read in Analytics as "learned 300
  // kanji today" and skew every trend from then on. This is a declaration of
  // knowledge you already had, not study that happened today — the same reason
  // bulk import doesn't log either.
  const commit = () => {
    if (picked.size === 0) return 0;
    const next = { ...progress };
    for (const ch of picked) next[ch] = "known";
    replaceProgress(next);
    setTagged((n) => n + picked.size);
    return picked.size;
  };

  const advance = () => {
    const justTagged = commit();
    setPicked(new Set());
    if (atEnd || justTagged < STOP_BELOW) {
      setFinished(true);
      return;
    }
    setStart((s) => s + BATCH);
  };

  const dismissForGood = () => {
    saveSettings({ ...loadSettings(), onboardingDismissed: true });
  };

  const finish = () => {
    commit();
    dismissForGood();
    void navigate("/");
  };

  const keepGoing = () => {
    setFinished(false);
    setStart((s) => Math.min(s + BATCH, Math.max(0, pool.length - BATCH)));
  };

  if (finished) {
    return (
      <div className="page page-center">
        <h1 className="page-title">
          {tagged > 0 ? `${tagged} kanji marked as known` : "Nothing marked yet"}
        </h1>
        <p className="onb-lead">
          {tagged > 0
            ? "You can change any of these later — tags are yours, and nothing else in Kanjii will overrule them."
            : "No problem. Everything starts as new, which is exactly where a beginner should be."}
        </p>
        <div className="onb-actions">
          <button className="onb-button onb-button-primary" onClick={finish}>
            Done
          </button>
          {!atEnd && (
            <button className="onb-button" onClick={keepGoing}>
              Keep going
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page page-center">
      <h1 className="page-title">Which of these can you read?</h1>
      <p className="onb-lead">
        Tap every kanji you already know. Leave the rest — you can change any of
        them later.
      </p>

      <div className="onb-grid">
        {batch.map((k) => (
          <button
            key={k.character}
            className={`onb-cell${picked.has(k.character) ? " picked" : ""}`}
            onClick={() => toggle(k.character)}
            aria-pressed={picked.has(k.character)}
          >
            {k.character}
          </button>
        ))}
      </div>

      <p className="onb-count">
        {picked.size} of {batch.length} on this screen · {tagged} so far
      </p>

      <div className="onb-actions">
        <button className="onb-button onb-button-primary" onClick={advance}>
          {atEnd ? "Finish" : "Next 30"}
        </button>
        <button className="onb-button" onClick={finish}>
          Stop here
        </button>
      </div>
    </div>
  );
}
