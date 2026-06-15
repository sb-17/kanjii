import { Link } from "react-router-dom";
import kanji from "../data/kanji.json";
import "../styles/Home.css";
import { getStatusCounts } from "../storage/kanjiProgress";
import { useProgress } from "../context/ProgressContext";

export default function Home() {
  const { progress } = useProgress();
  const statusCounts = getStatusCounts(progress);
  const total = kanji.length;
  const newCount = total - statusCounts.learning - statusCounts.known;

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
      </div>

      <div className="home-links">
        <Link to="/practice" className="home-link-card surface-card">
          Practice
        </Link>
        <Link to="/learn" className="home-link-card surface-card">
          Learn
        </Link>
        <Link to="/kanji-list" className="home-link-card surface-card">
          All kanji
        </Link>
        <Link to="/cards" className="home-link-card surface-card">
          Cards
        </Link>
      </div>
    </div>
  );
}
