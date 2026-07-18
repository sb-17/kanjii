import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Navigation from "./components/navigation/Navigation";
import Home from "./pages/Home";
import Learn from "./pages/Learn";
import Cards from "./pages/Cards";
import Practice from "./pages/Practice";
import Write from "./pages/Write";
import MyWords from "./pages/MyWords";
import Print from "./pages/Print";
import SetDetail from "./pages/SetDetail";
import KanjiList from "./pages/KanjiList";
import Settings from "./pages/Settings";
import About from "./pages/About";
import Support from "./pages/Support";
import Analytics from "./pages/Analytics";
import { ProgressProvider } from "./context/ProgressContext";
import "./App.css";

// Code-split the connection map and the kanji detail page: both pull in the
// precomputed graph data (~116 KB), so lazy-loading keeps it off the initial
// bundle. Rollup hoists the shared graph into its own chunk, fetched by whichever
// of the two you open first.
const KanjiMap = lazy(() => import("./pages/KanjiMap"));
const Kanji = lazy(() => import("./pages/Kanji"));

function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    // Poll for the goatcounter script to load, but give up after ~5s: when it's
    // blocked (ad blocker) or offline it never appears, and an uncapped 100ms
    // loop would run forever.
    let attempts = 0;
    const interval = setInterval(() => {
      if (window.goatcounter && window.goatcounter.count) {
        clearInterval(interval);
        window.goatcounter.count({
          path: location.pathname + location.search,
        });
      } else if (++attempts >= 50) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [location]);

  return null;
}

export default function App() {
  return (
    <ProgressProvider>
      <Router basename={import.meta.env.BASE_URL}>
        <AnalyticsTracker />

        <div className="app-container">
          <Navigation />

          <main className="app-content">
            <Suspense fallback={<div className="page">Loading…</div>}>
            <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/kanji" element={<KanjiList />} />
            <Route path="/map" element={<KanjiMap />} />
            <Route path="/kanji/:char" element={<Kanji />} />
            <Route path="/kanji/:char/write" element={<Write />} />
            <Route path="/sets" element={<Learn />} />
            <Route path="/sets/:setId" element={<SetDetail />} />
            <Route path="/cards" element={<Cards />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/write" element={<Write />} />
            <Route path="/print" element={<Print />} />
            <Route path="/words" element={<MyWords />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<About />} />
            <Route path="/support" element={<Support />} />
            {/* redirects from the old paths */}
            <Route path="/kanji-list" element={<Navigate to="/kanji" replace />} />
            <Route path="/learn" element={<Navigate to="/sets" replace />} />
            <Route path="/my-words" element={<Navigate to="/words" replace />} />
            </Routes>
            </Suspense>
          </main>
        </div>
      </Router>
    </ProgressProvider>
  );
}