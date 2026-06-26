import { useMemo } from "react";
import { Link } from "react-router-dom";
import "../styles/Analytics.css";
import { useProgress } from "../context/ProgressContext";
import { loadUserVocab } from "../storage/userVocab";
import {
  statusBreakdown,
  frequencyBands,
  mostFrequentNew,
  srsStats,
  vocabTotals,
  vocabGrowth,
} from "../lib/analytics";

export default function Analytics() {
  const { progress } = useProgress();
  const vocab = loadUserVocab();

  const status = useMemo(() => statusBreakdown(progress), [progress]);
  const bands = useMemo(() => frequencyBands(progress), [progress]);
  const nextUp = useMemo(() => mostFrequentNew(progress, 12), [progress]);
  const srs = useMemo(() => srsStats(vocab, progress), [vocab, progress]);
  const totals = useMemo(() => vocabTotals(vocab, progress), [vocab, progress]);
  const growth = useMemo(() => vocabGrowth(vocab, 8), [vocab]);

  const pct = (n: number) => (status.total ? Math.round((n / status.total) * 100) : 0);
  const boxMax = Math.max(srs.unstudied, ...srs.boxes, 1);
  const growthMax = Math.max(...growth.buckets.map((b) => b.count), 1);

  return (
    <div className="page">
      <h1 className="page-title">Analytics</h1>

      <div className="analytics-grid">
        {/* ---- Kanji progress ---- */}
        <section className="stat-card surface-card">
          <h2 className="stat-card-title">Kanji progress</h2>
          <div className="stat-headline">
            <span className="stat-big">{pct(status.known)}%</span>
            <span className="stat-sub">
              known · {pct(status.known + status.learning)}% started
            </span>
          </div>

          <div className="stacked-bar" role="img" aria-label="Kanji status breakdown">
            <span className="seg known" style={{ width: `${pct(status.known)}%` }} />
            <span className="seg learning" style={{ width: `${pct(status.learning)}%` }} />
          </div>

          <ul className="legend">
            <li>
              <span className="dot known" /> Known <strong>{status.known}</strong>
            </li>
            <li>
              <span className="dot learning" /> Learning <strong>{status.learning}</strong>
            </li>
            <li>
              <span className="dot new" /> New <strong>{status.new}</strong>
            </li>
            <li className="legend-total">of {status.total}</li>
          </ul>
        </section>

        {/* ---- Progress by frequency ---- */}
        <section className="stat-card surface-card">
          <h2 className="stat-card-title">By frequency</h2>
          <p className="stat-note">How much of each frequency tier you know.</p>

          <div className="band-list">
            {bands.map((b) => {
              const knownPct = b.total ? (b.known / b.total) * 100 : 0;
              const learnPct = b.total ? (b.learning / b.total) * 100 : 0;
              return (
                <div className="band-row" key={b.label}>
                  <span className="band-label">{b.label}</span>
                  <span className="band-bar">
                    <span className="seg known" style={{ width: `${knownPct}%` }} />
                    <span className="seg learning" style={{ width: `${learnPct}%` }} />
                  </span>
                  <span className="band-pct">{Math.round(knownPct)}%</span>
                </div>
              );
            })}
          </div>

          <h3 className="stat-subheading">Most frequent still new</h3>
          {nextUp.length === 0 ? (
            <p className="stat-note">You've started every ranked kanji. 🎉</p>
          ) : (
            <div className="kanji-chips">
              {nextUp.map((k) => (
                <Link
                  key={k.character}
                  className="kanji-chip"
                  to={`/kanji/${encodeURIComponent(k.character)}`}
                  title={k.meanings.join(", ")}
                >
                  {k.character}
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ---- Review queue (SRS) ---- */}
        <section className="stat-card surface-card">
          <h2 className="stat-card-title">Review queue</h2>
          {totals.total === 0 ? (
            <p className="stat-note">
              Add words to build a review queue.{" "}
              <Link to="/words">My words →</Link>
            </p>
          ) : (
            <>
              <div className="stat-duo">
                <div>
                  <span className="stat-big">{srs.dueToday}</span>
                  <span className="stat-sub">due today</span>
                </div>
                <div>
                  <span className="stat-big">{srs.unstudied}</span>
                  <span className="stat-sub">new to learn</span>
                </div>
              </div>

              <h3 className="stat-subheading">Leitner boxes</h3>
              <div className="box-bars">
                <div className="box-col">
                  <span className="box-fill" style={{ height: `${(srs.unstudied / boxMax) * 100}%` }} />
                  <span className="box-count">{srs.unstudied}</span>
                  <span className="box-label">new</span>
                </div>
                {srs.boxes.map((c, i) => (
                  <div className="box-col" key={i}>
                    <span className="box-fill" style={{ height: `${(c / boxMax) * 100}%` }} />
                    <span className="box-count">{c}</span>
                    <span className="box-label">{i}</span>
                  </div>
                ))}
              </div>

              {srs.dueToday > 0 && (
                <Link className="stat-cta" to="/practice">
                  Review now →
                </Link>
              )}
            </>
          )}
        </section>

        {/* ---- Vocabulary ---- */}
        <section className="stat-card surface-card">
          <h2 className="stat-card-title">Vocabulary</h2>
          <div className="stat-duo">
            <div>
              <span className="stat-big">{totals.unlocked}</span>
              <span className="stat-sub">unlocked</span>
            </div>
            <div>
              <span className="stat-big">{totals.locked}</span>
              <span className="stat-sub">locked</span>
            </div>
            <div>
              <span className="stat-big">{totals.total}</span>
              <span className="stat-sub">total words</span>
            </div>
          </div>

          <h3 className="stat-subheading">Words added / week</h3>
          {totals.total === 0 ? (
            <p className="stat-note">
              No words yet. <Link to="/words">Add some →</Link>
            </p>
          ) : (
            <>
              <div className="growth-bars">
                {growth.buckets.map((b, i) => (
                  <div className="growth-col" key={i} title={`${b.count} added`}>
                    <span
                      className="growth-fill"
                      style={{ height: `${(b.count / growthMax) * 100}%` }}
                    />
                    <span className="growth-label">{b.label}</span>
                  </div>
                ))}
              </div>
              {(growth.older > 0 || growth.untracked > 0) && (
                <p className="stat-note">
                  {growth.older > 0 && `${growth.older} added earlier`}
                  {growth.older > 0 && growth.untracked > 0 && " · "}
                  {growth.untracked > 0 && `${growth.untracked} undated`}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
