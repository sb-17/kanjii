import { Link } from "react-router-dom";
import kanji from "../data/kanji.json";
import "../styles/Home.css";
import { getStatusCounts } from "../storage/kanjiProgress";
import { loadUserVocab } from "../storage/userVocab";
import { useProgress } from "../context/ProgressContext";

export default function Home() {
  const { progress } = useProgress();
  const statusCounts = getStatusCounts(progress);
  const total = kanji.length;
  const newCount = total - statusCounts.learning - statusCounts.known;
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
          <strong>{newCount}</strong> new
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
