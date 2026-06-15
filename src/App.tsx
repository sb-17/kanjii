import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import Navigation from "./components/navigation/Navigation";
import Home from "./pages/Home";
import Learn from "./pages/Learn";
import Cards from "./pages/Cards";
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

        <main className="app-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/kanji-list" element={<KanjiList />} />
            <Route path="/sets/:setId" element={<SetDetail />} />
            <Route path="/learn" element={<Learn />} />
            <Route path="/kanji/:char" element={<Kanji />} />
            <Route path="/cards" element={<Cards />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}