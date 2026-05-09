import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import Navigation from "./components/navigation/Navigation";
import Learn from "./pages/Learn";
import Practice from "./pages/Practice";
import SetDetail from "./pages/SetDetail";
import Kanji from "./pages/Kanji";
import KanjiList from "./pages/KanjiList";
import Settings from "./pages/Settings";
import About from "./pages/About";
import "./App.css";

function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    const interval = setInterval(() => {
      if (window.goatcounter && window.goatcounter.count) {
        clearInterval(interval);

        window.goatcounter.count({
          path: location.pathname + location.search,
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [location]);

  return null;
}

export default function App() {
  return (
    <Router basename="/kanjii">
      <AnalyticsTracker />

      <div className="app-container">
        <Navigation />

        <Routes>
          <Route path="/" element={<Learn />} />
          <Route path="/sets/:setId" element={<SetDetail />} />
          <Route path="/kanji-list" element={<KanjiList />} />
          <Route path="/kanji/:char" element={<Kanji />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </div>
    </Router>
  );
}