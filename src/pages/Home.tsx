import { useMemo } from "react";
import { Link } from "react-router-dom";
import "../styles/Home.css";
import {
  statusBreakdown,
  srsStats,
  writingStats,
  newWordsIntroducedToday,
} from "../lib/analytics";
import { deckCounts } from "../lib/deckSrs";
import { loadUserVocab } from "../storage/userVocab";
import { loadKanjiSkill } from "../storage/kanjiSkill";
import { loadEvents } from "../storage/events";
import { loadSettings } from "../storage/settings";
import { loadDecks } from "../storage/decks";
import { loadDeckProgress } from "../storage/deckProgress";
import { useProgress } from "../context/ProgressContext";
import { useNow } from "../lib/useNow";

export default function Home() {
  const { progress } = useProgress();
  const now = useNow();
  const vocab = loadUserVocab();

  // Same counter Analytics uses. The old one tallied the progress *map*, so any
  // character not in kanji.json (an older import, a dataset change) inflated the
  // totals here relative to Analytics and could drive "new" negative.
  const statusCounts = statusBreakdown(progress);
  const wordCount = vocab.length;

  // Every figure below comes from the same helper as the page it links to —
  // srsStats().due is "words Practice's Due scope would offer right now", and
  // writingStats().due likewise for Write. A count computed independently here
  // would eventually advertise work the page doesn't hand you.
  const newBudget = Math.max(
    0,
    loadSettings().newPerDay - newWordsIntroducedToday(loadEvents(), now),
  );
  const srs = useMemo(
    () => srsStats(vocab, progress, now, newBudget),
    [vocab, progress, now, newBudget],
  );
  const writing = useMemo(
    () => writingStats(loadKanjiSkill(), progress, now),
    [progress, now],
  );
  const decksDue = useMemo(() => {
    const boxes = loadDeckProgress();
    return loadDecks().reduce(
      (n, deck) => n + deckCounts(deck.cards, boxes[deck.id] ?? {}, now).due,
      0,
    );
  }, [now]);

  // Zero is shown rather than hidden: a row that changes shape as counts empty
  // out makes the page jump, and "nothing waiting" is worth seeing plainly.
  const due = [
    { to: "/write", count: writing.due, label: "to write" },
    { to: "/practice", count: srs.due, label: srs.due === 1 ? "word due" : "words due" },
    { to: "/cards", count: decksDue, label: "deck cards" },
  ];

  // "Study now" takes the first of these with anything waiting. Fixed priority,
  // not the largest count: the three are different units — kanji, words, cards —
  // so there is no honest way to compare 3 kanji against 12 deck cards. Writing
  // leads because kanji are what the app is for; vocabulary reviews then decks.
  // The array order *is* that priority, so the row below can't drift from it.
  const next = due.find((item) => item.count > 0);

  return (
    <div className="page page-center">
      <h1 className="page-title">Kanjii</h1>

      <h2 className="home-section">Today</h2>

      {next ? (
        <Link to={next.to} className="home-study-now surface-card">
          Study now
          <span>
            {next.count} {next.label}
          </span>
        </Link>
      ) : (
        <p className="home-study-clear">
          Nothing due right now — everything's up to date.
        </p>
      )}

      <div className="home-due">
        {due.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`home-due-card surface-card${item.count === 0 ? " home-due-empty" : ""}`}
          >
            <strong>{item.count}</strong> {item.label}
          </Link>
        ))}
      </div>

      <h2 className="home-section">Progress</h2>
      <div className="home-progress">
        <div className="home-stat surface-card">
          <strong>{statusCounts.known}</strong> known
        </div>
        <div className="home-stat surface-card">
          <strong>{statusCounts.learning}</strong> learning
        </div>
        <div className="home-stat surface-card">
          <strong>{statusCounts.new}</strong> new
        </div>
        <div className="home-stat surface-card">
          <strong>{wordCount}</strong> {wordCount === 1 ? "word" : "words"}
        </div>
      </div>

      <div className="home-links">
        <Link to="/kanji" className="home-link-card surface-card">
          All kanji
        </Link>
        <Link to="/write" className="home-link-card surface-card">
          Write
        </Link>
        <Link to="/practice" className="home-link-card surface-card">
          Practice
        </Link>
        <Link to="/cards" className="home-link-card surface-card">
          Cards
        </Link>
        <Link to="/words" className="home-link-card surface-card">
          My words
        </Link>
        {/* Six links, not five: the grid is 2 or 3 columns, and both divide into
            six. Removing one strands the last tile again. */}
        <Link to="/analytics" className="home-link-card surface-card">
          Analytics
        </Link>
      </div>
    </div>
  );
}
