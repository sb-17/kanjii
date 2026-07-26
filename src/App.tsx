import { useEffect, useLayoutEffect, lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import Navigation from "./components/navigation/Navigation";
import Home from "./pages/Home";
import Learn from "./pages/Learn";
import Cards from "./pages/Cards";
import Practice from "./pages/Practice";
import Write from "./pages/Write";
import KanjiLearn from "./pages/KanjiLearn";
import MyWords from "./pages/MyWords";
import WordDetail from "./pages/WordDetail";
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

// Send each new (PUSH) navigation to the top of the scrolling pane. Otherwise a
// route change keeps the previous page's scroll offset — e.g. opening a kanji from
// a scrolled list would land partway down. Back/forward (POP) is left alone so
// pages that restore their own scroll (the kanji list) can return you where you
// were. useLayoutEffect so it happens before paint (no visible jump).
function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType();
  useLayoutEffect(() => {
    if (navType !== "PUSH") return;
    document.querySelector<HTMLElement>(".app-content")?.scrollTo(0, 0);
  }, [location.key, navType]);
  return null;
}

// The shell locks html/body to `overflow: hidden` so only .app-content scrolls —
// but a mobile browser still scrolls the *document* to reveal a text field when
// the keyboard opens. With the page locked there's no way to scroll that offset
// back by hand, so it sticks: the fixed nav toggle stays pinned to the viewport
// while the content sits shifted underneath it, and it survives navigation
// (ScrollManager only resets .app-content). Snap the document back whenever it
// drifts. The viewport meta's `interactive-widget=resizes-content` prevents most
// of this where it's supported; this covers the browsers that ignore it.
function ViewportGuard() {
  useEffect(() => {
    const reset = () => {
      const el = document.scrollingElement ?? document.documentElement;
      if (el.scrollTop !== 0) el.scrollTop = 0;
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
    };
    // `scroll` catches the drift as it happens; the visual-viewport resize catches
    // the keyboard closing, which can leave an offset without firing a scroll.
    window.addEventListener("scroll", reset, { passive: true });
    window.visualViewport?.addEventListener("resize", reset);
    return () => {
      window.removeEventListener("scroll", reset);
      window.visualViewport?.removeEventListener("resize", reset);
    };
  }, []);
  return null;
}

export default function App() {
  return (
    <ProgressProvider>
      <Router basename={import.meta.env.BASE_URL}>
        <AnalyticsTracker />
        <ScrollManager />
        <ViewportGuard />

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
            <Route path="/kanji/:char/learn" element={<KanjiLearn />} />
            <Route path="/sets" element={<Learn />} />
            <Route path="/sets/:setId" element={<SetDetail />} />
            <Route path="/cards" element={<Cards />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/write" element={<Write />} />
            <Route path="/print" element={<Print />} />
            <Route path="/words" element={<MyWords />} />
            <Route path="/word/:key" element={<WordDetail />} />
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