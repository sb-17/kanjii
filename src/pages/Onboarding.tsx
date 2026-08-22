import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

// Shown once, after the selector, and never again. The nav and Home's tile grid
// are the permanent index of everything the app does; this is the short version
// someone reads on their way in, so it covers the loop Kanjii is built around —
// use your tags, collect words, review them — and stops there.
//
// Four items, deliberately. Print, Map, Analytics and the Anki importer are all
// real features and all wrong here: none of them is a thing to do on day one,
// and every extra row spends the attention the first four need. Ordered as a
// sentence rather than by importance — Write uses the tags that were just made,
// My words and Read are the two ways in for vocabulary, Practice is what comes
// back out.
const NEXT_STEPS = [
  {
    to: "/write",
    icon: "✏️",
    title: "Write",
    text: "Practise writing the kanji you know, by hand. Kanjii checks each stroke as you draw it.",
  },
  {
    to: "/words",
    icon: "📚",
    title: "My words",
    text: "There's no fixed word list. Add the words you actually meet and they become your practice material.",
  },
  {
    to: "/read",
    icon: "📖",
    title: "Read",
    text: "Paste any Japanese text to see the words in it, each one checked against the kanji you know.",
  },
  {
    to: "/practice",
    icon: "🔁",
    title: "Practice",
    text: "Review your words with spaced repetition, in both directions.",
  },
];

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
  // "pick" is the grid, "summary" reports what was tagged, "guide" is the
  // one-time tour. One value rather than a pair of booleans: the three are
  // mutually exclusive, and flags with an implicit precedence are how an
  // impossible fourth state gets invented later.
  const [phase, setPhase] = useState<"pick" | "summary" | "guide">("pick");

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
      setPhase("summary");
      return;
    }
    setStart((s) => s + BATCH);
  };

  const dismissForGood = () => {
    saveSettings({ ...loadSettings(), onboardingDismissed: true });
  };

  // Both ways out of the grid land on the guide: "Stop here" and the summary's
  // "Done". Dismissal happens here rather than on the guide's own button, so
  // closing the tab while reading the guide doesn't re-offer setup next visit —
  // the selector is the part you'd resent being asked to redo.
  const finish = () => {
    commit();
    dismissForGood();
    setPhase("guide");
  };

  const keepGoing = () => {
    setPhase("pick");
    setStart((s) => Math.min(s + BATCH, Math.max(0, pool.length - BATCH)));
  };

  if (phase === "guide") {
    return (
      <div className="page page-center">
        <h1 className="page-title">Welcome to Kanjii!</h1>
        {/* Names the count even though the summary screen before this one is
            headed with it. The repetition is deliberate: it ties the list to
            work the user just did, and "Stop here" skips the summary entirely,
            so this is the only place some people see a total at all. */}
        <p className="onb-lead">
          {tagged > 0
            ? `You've added ${tagged} kanji. Here's what you can do now:`
            : "Here's what you can do:"}
        </p>

        <div className="onb-steps">
          {NEXT_STEPS.map((s) => (
            <Link key={s.to} to={s.to} className="onb-step surface-card">
              <span className="onb-step-icon" aria-hidden="true">
                {s.icon}
              </span>
              <span className="onb-step-body">
                <strong className="onb-step-title">{s.title}</strong>
                <span className="onb-step-text">{s.text}</span>
              </span>
            </Link>
          ))}
        </div>

        {/* The part that actually matters. A new user's first impression is that
            the app is empty, and without this they read that as unfinished
            rather than as the design. */}
        <p className="onb-closing">
          Kanjii doesn't set a path for you. You decide what to learn and it
          keeps track — which is why it starts out this empty.
        </p>

        <div className="onb-actions">
          <button
            className="onb-button onb-button-primary"
            onClick={() => void navigate("/")}
          >
            Got it, let's go →
          </button>
        </div>
      </div>
    );
  }

  if (phase === "summary") {
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
