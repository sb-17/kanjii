import { Link } from "react-router-dom";
import "../styles/Home.css";
import { statusBreakdown } from "../lib/analytics";
import { loadUserVocab } from "../storage/userVocab";
import { useProgress } from "../context/ProgressContext";

export default function Home() {
  const { progress } = useProgress();
  // Same counter Analytics uses. The old one tallied the progress *map*, so any
  // character not in kanji.json (an older import, a dataset change) inflated the
  // totals here relative to Analytics and could drive "new" negative.
  const statusCounts = statusBreakdown(progress);
  const wordCount = loadUserVocab().length;

  return (
    <div className="page page-center">
      <h1 className="page-title">Kanjii</h1>

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
        <Link to="/words" className="home-link-card surface-card">
          My words
        </Link>
        <Link to="/practice" className="home-link-card surface-card">
          Practice
        </Link>
      </div>
    </div>
  );
}
