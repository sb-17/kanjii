import { useMemo, useState } from "react";
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
import { loadSettings, saveSettings } from "../storage/settings";
import { loadCloudConfig } from "../storage/cloudSync";
import { loadDecks } from "../storage/decks";
import { loadDeckProgress } from "../storage/deckProgress";
import { useProgress } from "../context/ProgressContext";
import { useNow } from "../lib/useNow";

// Days without a backup before Home says so, and the amount of work that has to
// exist before it's worth saying. Two weeks is short enough that you can't lose a
// season of study, long enough not to nag someone who studies daily.
const BACKUP_WARN_DAYS = 14;
const BACKUP_MIN_ITEMS = 20;

export default function Home() {
  const { progress } = useProgress();
  const now = useNow();
  const vocab = loadUserVocab();

  // Same counter Analytics uses. The old one tallied the progress *map*, so any
  // character not in kanji.json (an older import, a dataset change) inflated the
  // totals here relative to Analytics and could drive "new" negative.
  const statusCounts = statusBreakdown(progress);

  // First-run prompt. Gated on *both* the dismissal flag and there being nothing
  // tagged: the flag alone would show this to every existing user on the next
  // deploy, and the tag count alone would bring it back for someone who dismissed
  // it and then did nothing. Held in state so dismissing hides it immediately.
  const [promptDismissed, setPromptDismissed] = useState(
    () => loadSettings().onboardingDismissed,
  );
  const showSetup =
    !promptDismissed && statusCounts.known + statusCounts.learning === 0;

  // Backup reminder. Local-first with no accounts means clearing browser data is
  // total, unrecoverable loss — the one outcome that would lose someone months of
  // work and never bring them back. Not dismissible on purpose: backing up is
  // what makes it go away, and a dismiss button only teaches people to dismiss it.
  //
  // Gated on there being something worth losing, so a first-day user with three
  // tagged kanji isn't lectured about backups.
  const lastBackupAt = loadCloudConfig().lastBackupAt;
  const worthLosing =
    statusCounts.known + statusCounts.learning + vocab.length >= BACKUP_MIN_ITEMS;
  const daysSinceBackup = Math.floor((now - lastBackupAt) / 86_400_000);
  const showBackupWarning =
    worthLosing && (lastBackupAt === 0 || daysSinceBackup >= BACKUP_WARN_DAYS);

  const dismissSetup = () => {
    saveSettings({ ...loadSettings(), onboardingDismissed: true });
    setPromptDismissed(true);
  };
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

      {showSetup && (
        <div className="home-setup surface-card">
          <strong className="home-setup-title">Start with what you know</strong>
          {/* Leads with the action, not the mechanism. The previous version
              opened on "your own tags" and "the reader" — a noun and a feature
              name a first-time reader hasn't met yet, since this card is the
              first thing they see — and "key off them", which is jargon. Read
              cold it sounded like it was describing something already set up,
              and at least one person took it for a bug. */}
          <p className="home-setup-text">
            Mark the kanji you can already read — it takes about a minute. Kanjii
            uses that to decide what to show you next, in practice, writing and
            reading alike.
          </p>
          <div className="home-setup-actions">
            {/* Deliberately doesn't dismiss: if you abandon the flow having
                tagged nothing, the prompt should still be here. Tagging anything
                hides it on its own, via the count above. */}
            <Link to="/start" className="home-setup-go">
              Get started
            </Link>
            <button className="home-setup-skip" onClick={dismissSetup}>
              I don't know any kanji yet
            </button>
          </div>
        </div>
      )}

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

      {showBackupWarning && (
        <p className="home-backup-warning">
          {lastBackupAt === 0
            ? "You haven't backed up yet."
            : `No backup in ${daysSinceBackup} days.`}{" "}
          Everything is stored in this browser only — clearing its data would
          delete it. <Link to="/settings">Back up</Link>
        </p>
      )}

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
