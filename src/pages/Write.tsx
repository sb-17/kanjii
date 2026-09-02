import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import "../styles/Write.css";
import type { Kanji } from "../types/kanjiType";
import type { KanjiProgress } from "../types/kanjiProgress";
import { ALL_KANJI, getKanji, hasKanji } from "../lib/kanjiIndex";
import { useProgress } from "../context/ProgressContext";
import { loadSettings, saveSettings } from "../storage/settings";
import type { Settings, WriteMode, WritePool } from "../types/settingsType";
import KanjiWriter, {
  type WriteResult,
} from "../components/kanji-writer/KanjiWriter";
import KanjiStrokeViewer from "../components/kanji-stroke-viewer/KanjiStrokeViewer";
import EmptyState from "../components/empty-state/EmptyState";
import { logWrite, loadEvents } from "../storage/events";
import { loadKanjiSkill, updateKanjiSkill } from "../storage/kanjiSkill";
import type { KanjiSkill, KanjiSkillMap } from "../types/kanjiSkill";
import {
  classifyWrite,
  demoteSkill,
  gradeSkill,
  isSkillDue,
  skillDueKey,
} from "../lib/kanjiSkill";
import { useNow } from "../lib/useNow";
import { newKanjiAllowance } from "../lib/analytics";

// Never-written kanji the Due pool may still add today. Read live from the event
// log rather than held in state: each new kanji written consumes one, and the
// pool is recomputed on every advance.
const remainingNewToday = (now: number) =>
  newKanjiAllowance(loadEvents(), loadSettings().writeNewPerDay, now);

// Kanji to practice in session mode. "both/learning/known" filter by status;
// "due" is reviews that have come round plus up to `newBudget` never-written
// kanji. Module scope so it's a stable memo dependency.
//
// That budget is the whole point of the split: an unwritten kanji counts as due,
// so tagging 200 kanji Learning used to drop all 200 into the pool at once and
// the reviews were never seen again. Callers derive it from the event log (see
// analytics `newKanjiAllowance`); the infinite default is the old behaviour and
// only right for the pools that don't schedule.
function computePool(
  p: WritePool,
  progress: KanjiProgress,
  skill: KanjiSkillMap,
  now: number,
  newBudget = Number.POSITIVE_INFINITY,
): Kanji[] {
  const active = ALL_KANJI.filter((k) => {
    const status = progress[k.character];
    return status === "learning" || status === "known";
  });

  if (p === "learning") return active.filter((k) => progress[k.character] === "learning");
  if (p === "known") return active.filter((k) => progress[k.character] === "known");
  if (p !== "due") return active; // both

  const reviews = active.filter((k) => {
    const s = skill[k.character];
    return s && s.due <= now;
  });
  if (newBudget <= 0) return reviews;
  // In dataset order, which is roughly by frequency — the same order the kanji
  // list introduces them in, so the day's new ones are the ones you'd reach next.
  const fresh = active.filter((k) => !skill[k.character]).slice(0, newBudget);
  return [...reviews, ...fresh];
}

// Pick the next kanji from a pool. Due orders soonest-first (with light
// randomness among the front runners, like vocab SRS); the rest pick at random.
// Avoids repeating the just-shown kanji when it can.
function pickFromPool(
  pool: Kanji[],
  scope: WritePool,
  skill: KanjiSkillMap,
  exceptChar?: string,
): string {
  if (pool.length === 0) return "";

  let candidates = pool;
  if (pool.length > 1 && exceptChar) {
    const filtered = pool.filter((k) => k.character !== exceptChar);
    if (filtered.length > 0) candidates = filtered;
  }

  if (scope === "due") {
    const sorted = [...candidates].sort(
      (a, b) => skillDueKey(skill[a.character]) - skillDueKey(skill[b.character]),
    );
    const topK = sorted.slice(0, Math.min(5, sorted.length));
    return topK[Math.floor(Math.random() * topK.length)].character;
  }
  return candidates[Math.floor(Math.random() * candidates.length)].character;
}

const POOLS: { id: WritePool; label: string }[] = [
  { id: "due", label: "Due" },
  { id: "both", label: "Both" },
  { id: "learning", label: "Learning" },
  { id: "known", label: "Known" },
];

// How many clean, unguided writes of a kanji suggest it's time to promote its
// tag to Known. Counted from the whole event log, not the SRS box: the box is
// spacing-gated (grinding one kanji in a session can't advance it, by design), so
// keying the suggestion off it would make the prompt unreachable in a sitting.
// "Can you write it from memory, repeatedly?" is a different question from "when
// should it come back?", and this is the right signal for the first one.
const PROMOTE_SUGGEST_COUNT = 6;

// Clean from-memory writes of this kanji across all sessions — unguided, hint-
// free, few enough misses to count (the same bar as an SRS promotion). Reused for
// both the suggestion trigger and its wording.
function cleanMemoryWriteCount(char: string): number {
  let n = 0;
  for (const e of loadEvents()) {
    if (e.k !== "write" || e.c !== char) continue;
    if (classifyWrite({ guide: e.g, strokes: e.n, misses: e.m, hints: e.h }) === "promote") {
      n++;
    }
  }
  return n;
}

export default function Write() {
  const { progress, setStatus } = useProgress();
  // Present on /kanji/:char/write — drills a single kanji on a loop.
  const { char: routeChar } = useParams<{ char?: string }>();
  const single = !!routeChar;
  const navigate = useNavigate();
  const location = useLocation();

  const [settings, setSettings] = useState<Settings>(loadSettings());
  const { writeMode, guide, writePool } = settings;

  // `now` refreshes on an interval so due-ness re-evaluates during a long session
  // (used when changing pool); `skill` mirrors the store for reactive re-renders.
  const now = useNow();
  const [skill, setSkill] = useState<KanjiSkillMap>(loadKanjiSkill);

  const [current, setCurrent] = useState<string>(() => {
    if (single) return routeChar!;
    return pickFromPool(
      computePool(
        writePool,
        progress,
        loadKanjiSkill(),
        Date.now(),
        remainingNewToday(Date.now()),
      ),
      writePool,
      loadKanjiSkill(),
    );
  });
  const [revealed, setRevealed] = useState(false);
  // Bumped on every advance so the writer remounts even when the kanji repeats.
  const [round, setRound] = useState(0);
  // When set, a just-completed kanji has earned enough writing skill to suggest
  // promoting its tag to Known. Pauses auto-advance until dismissed or acted on.
  const [promoteSuggest, setPromoteSuggest] = useState<string | null>(null);
  // Kanji dismissed with "Not yet" this session — don't re-nag them.
  const dismissedPromotes = useRef<Set<string>>(new Set());

  // Keep up with the URL if you jump straight to another kanji's writing page.
  useEffect(() => {
    if (single && routeChar && routeChar !== current) {
      setCurrent(routeChar);
      setRevealed(false);
      setRound((r) => r + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeChar]);

  const updateSettings = (patch: Partial<Settings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    saveSettings(updated);
  };

  const changeMode = (mode: WriteMode) => {
    // Due used to be forced back to Both here: paper couldn't grade, so the filter
    // never cleared and stuck on the same kanji. Self-report grading fixed that, so
    // paper keeps whichever pool you were on.
    updateSettings({ writeMode: mode });
    setRevealed(false);
  };

  const changePool = (p: WritePool) => {
    updateSettings({ writePool: p });
    setRevealed(false);
    setPromoteSuggest(null);
    const nextPool = computePool(p, progress, skill, now, remainingNewToday(now));
    // Keep the current kanji if it still matches; otherwise move to a new one.
    if (nextPool.some((k) => k.character === current)) return;
    setRound((r) => r + 1);
    setCurrent(pickFromPool(nextPool, p, skill));
  };

  const pickNext = () => {
    setRevealed(false);
    setPromoteSuggest(null);
    setRound((r) => r + 1);
    if (single) return; // single mode keeps the same kanji (round bump remounts)
    // Recompute the pool from live state, not the render closure: after grading,
    // the memoized `pool`/`skill` are a tick stale, and a Due kanji just completed
    // is no longer in it. Set unconditionally so an emptied pool ("") falls
    // through to the empty state instead of sticking on the last kanji.
    const live = loadKanjiSkill();
    const freshPool = computePool(
      writePool,
      progress,
      live,
      Date.now(),
      remainingNewToday(Date.now()),
    );
    setCurrent(pickFromPool(freshPool, writePool, live, current));
  };

  // A back affordance has to actually go back. This was a Link, which *pushes*:
  // leaving the writer stacked a second /kanji/:char entry, so the kanji page's
  // own ← Back (navigate(-1)) landed you straight back in the writer — the two
  // pages trapped you between them, browser back button included. Popping keeps
  // history honest, so back from the kanji page reaches the list as expected.
  // Opened directly (deep link, refresh, PWA shortcut) there's nothing to pop —
  // location.key is "default" only for a session's first entry — so go forward
  // to the kanji page instead of dumping the user out of the app.
  const goBack = () => {
    if (location.key === "default") {
      navigate(`/kanji/${encodeURIComponent(current)}`);
    } else {
      navigate(-1);
    }
  };

  // Bad /kanji/:char/write URL.
  if (single && !hasKanji(routeChar ?? "")) {
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

  const obj = getKanji(current);
  const readings = obj ? [...obj.kun, ...obj.on].slice(0, 3) : [];

  // The writer already shows "Correct!" briefly before calling this. Record how
  // the attempt went before advancing — writing from memory and tracing the
  // template are different evidence, and this log is the only place that
  // difference is kept.
  const handleComplete = (r: WriteResult) => {
    logWrite({
      c: current,
      n: r.strokes,
      m: r.misses,
      h: r.hints,
      g: guide,
      ms: r.ms,
    });

    // Update handwriting skill from the attempt. Guided tracing grades as
    // "practice" and never advances the box, so the level always reflects memory.
    //
    // Promotion is gated on the kanji having been *due*: rewriting one kanji five
    // times in a session shouldn't rocket it up five boxes — that's grinding, and
    // it's the opposite of what spacing is for. Extra practice while ahead of
    // schedule is welcome but doesn't level up. A struggled write still holds
    // (reschedules) regardless.
    const at = Date.now();
    const prev = skill[current];
    const outcome = classifyWrite({
      guide,
      strokes: r.strokes,
      misses: r.misses,
      hints: r.hints,
    });
    const effective =
      outcome === "promote" && !isSkillDue(prev, at) ? "practice" : outcome;
    const next = gradeSkill(prev, effective, at);
    if (next !== prev) setSkill(updateKanjiSkill(current, next));

    // Offer to promote the tag once the kanji's been written cleanly from memory
    // enough times and it's still only Learning. Suggest, never set — pauses here
    // so the banner attaches to the kanji it's about, rather than flashing past.
    // logWrite above already appended to the event cache, so this counts it.
    if (
      progress[current] === "learning" &&
      !dismissedPromotes.current.has(current) &&
      cleanMemoryWriteCount(current) >= PROMOTE_SUGGEST_COUNT
    ) {
      setPromoteSuggest(current);
    } else {
      pickNext();
    }
  };

  // Paper mode: there are no strokes to check, so the learner reports how it went.
  // That self-report is the whole reason paper can now touch the SRS at all —
  // before this it recorded nothing, which is why Due used to be hidden here.
  //
  // "Got it" is treated exactly like a clean unguided screen write, due-gate
  // included: extra practice while ahead of schedule doesn't level anything up.
  // "Again" demotes to box 0 — see demoteSkill.
  const handlePaperGrade = (got: boolean) => {
    const at = Date.now();
    const strokes = obj?.strokes ?? 0;

    // Logged so paper practice counts in Writes/day and toward the promote-to-Known
    // suggestion, both of which read the event log. There's no per-stroke data to
    // record, so the self-report is expressed in the terms `classifyWrite` already
    // understands: a clean run, or one where nothing came out right.
    logWrite({
      c: current,
      n: strokes,
      m: got ? 0 : strokes,
      h: 0,
      g: false,
      ms: 0,
    });

    const prev = skill[current];
    let next: KanjiSkill | undefined;
    if (!got) {
      next = demoteSkill(prev, at);
    } else {
      next = gradeSkill(prev, isSkillDue(prev, at) ? "promote" : "practice", at);
    }
    if (next !== prev) setSkill(updateKanjiSkill(current, next));

    if (
      got &&
      progress[current] === "learning" &&
      !dismissedPromotes.current.has(current) &&
      cleanMemoryWriteCount(current) >= PROMOTE_SUGGEST_COUNT
    ) {
      setPromoteSuggest(current);
    } else {
      pickNext();
    }
  };

  // Resolve the promotion banner: either mark the kanji Known or dismiss, then
  // carry on to the next kanji.
  const resolvePromote = (markKnown: boolean) => {
    if (promoteSuggest) {
      if (markKnown) setStatus(promoteSuggest, "known");
      else dismissedPromotes.current.add(promoteSuggest); // don't nag again this session
    }
    setPromoteSuggest(null);
    pickNext();
  };

  const emptyMessage =
    writePool === "due"
      ? "You're caught up — no kanji are due for writing review right now. Switch the filter to keep practising."
      : writePool === "both"
        ? "Writing practice uses kanji you've marked Learning or Known. Mark some kanji, or change the filter above."
        : `No kanji marked ${writePool} yet. Mark some, or change the filter above.`;

  return (
    <div className="page page-center">
      {single && (
        <button type="button" className="write-back" onClick={goBack}>
          ← Back to <span lang="ja">{current}</span>
        </button>
      )}

      {current && (
        <div className="write-prompt">
          <strong>Write:</strong>{" "}
          {/* The prompt is the English meaning where there is one, and falls
              back to the character itself — so only that branch is Japanese. */}
          {obj ? obj.meanings.join(", ") : <span lang="ja">{current}</span>}
          {readings.length > 0 && (
            <span className="write-reading" lang="ja">
              {" "}
              ({readings.join(", ")})
            </span>
          )}
        </div>
      )}

      <div className="write-toggles">
        <div className="write-modes">
          <button
            className={`write-toggle${writeMode === "screen" ? " active" : ""}`}
            onClick={() => changeMode("screen")}
          >
            Screen
          </button>
          <button
            className={`write-toggle${writeMode === "paper" ? " active" : ""}`}
            onClick={() => changeMode("paper")}
          >
            Paper
          </button>
        </div>
      </div>

      {!single && (
        <div className="write-toggles">
          <div className="write-modes">
            {POOLS.map((p) => (
              <button
                key={p.id}
                className={`write-toggle${writePool === p.id ? " active" : ""}`}
                onClick={() => changePool(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {writeMode === "screen" && (
        <div className="write-toggles">
          <label className="write-guide">
            <input
              type="checkbox"
              checked={guide}
              onChange={(e) => updateSettings({ guide: e.target.checked })}
            />
            <span>Guide</span>
          </label>
        </div>
      )}

      {!current ? (
        <EmptyState
          title="Nothing to write yet"
          message={emptyMessage}
          actions={[
            { to: "/kanji", label: "Browse kanji" },
            { to: "/sets", label: "Browse sets" },
          ]}
        />
      ) : writeMode === "screen" ? (
        <KanjiWriter
          key={`${current}-${round}`}
          kanji={current}
          guide={guide}
          onComplete={handleComplete}
          extraAction={
            promoteSuggest
              ? undefined
              : { label: single ? "Again" : "Skip", onClick: pickNext }
          }
        />
      ) : (
        <div className="write-paper">
          {revealed ? (
            <>
              <div className="write-answer">{current}</div>
              <KanjiStrokeViewer kanji={current} />
            </>
          ) : (
            <p className="write-paper-hint">
              Write it on paper from memory, then reveal to check.
            </p>
          )}
        </div>
      )}

      {promoteSuggest && (
        <div
          className="write-promote-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Promote kanji"
        >
          <div
            className="write-promote-backdrop"
            onClick={() => resolvePromote(false)}
          />
          <div className="write-promote-modal">
            <p className="write-promote-text">
              You've written{" "}
              <span className="write-promote-char">{promoteSuggest}</span> from
              memory {cleanMemoryWriteCount(promoteSuggest)}× — mark it Known?
            </p>
            <div className="write-promote-actions">
              <button
                className="write-action write-action-primary"
                onClick={() => resolvePromote(true)}
              >
                Mark Known
              </button>
              <button className="write-action" onClick={() => resolvePromote(false)}>
                Not yet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paper mode only. In screen mode Skip is handed to KanjiWriter instead,
          so it shares one row with Hint and Clear rather than sitting in a
          second container below them at a different size. */}
      {current && !promoteSuggest && writeMode === "paper" && (
        <div className="write-actions">
          {revealed ? (
            <>
              <button
                className="write-action"
                onClick={() => handlePaperGrade(false)}
              >
                Again
              </button>
              <button
                className="write-action write-action-primary"
                onClick={() => handlePaperGrade(true)}
              >
                Got it
              </button>
            </>
          ) : (
            <>
              {!single && (
                <button className="write-action" onClick={pickNext}>
                  Skip
                </button>
              )}
              <button
                className="write-action write-action-primary"
                onClick={() => setRevealed(true)}
              >
                Show answer
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
