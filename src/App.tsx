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
// TEMPORARY — diagnostic for the keyboard/scroll bug, enabled with ?debug=scroll.
// Remove this import, the <ScrollDebug/> below, and the component file together.
import ScrollDebug from "./components/scroll-debug/ScrollDebug";
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

// Put the document back to 0 once the keyboard has gone.
//
// A mobile browser scrolls the *document* — not .app-content — to reveal a focused
// text field. The shell locks html/body to `overflow: hidden`, so that offset
// can't be scrolled back by hand: the whole app stays shifted up, and since the
// nav toggle is anchored to the shell it travels with it, sometimes clean off the
// screen where it can't be tapped. Nothing else ever resets it, so it also
// survives navigating to another page.
//
// Deliberately narrow. Earlier attempts reset on every scroll event, which fought
// the browser mid-interaction and produced a visible snap; this waits until the
// viewport is back to full height (keyboard dismissed) and the page is otherwise
// still, so the correction lands when nothing is moving. Checking the height
// rather than focus covers Android's back-button dismissal, which closes the
// keyboard while leaving the field focused.
function ViewportReset() {
  useEffect(() => {
    const vv = window.visualViewport;
    const heightNow = () => vv?.height ?? window.innerHeight;
    // Tallest the viewport has been = its height with no keyboard up.
    let tallest = heightNow();
    let timer: ReturnType<typeof setTimeout>;

    // Keep re-checking while the keyboard looks like it's still up, instead of
    // checking once and giving up.
    //
    // Giving up was a PWA-only bug. In a browser the bottom/URL bar coming back
    // after the keyboard fires *more* visualViewport resizes, so `restore` got
    // retriggered and some later attempt landed on a full-height viewport. A
    // standalone PWA has no such bar: if the one check happened to run while the
    // keyboard was still animating out, nothing ever tried again — and with
    // html/body overflow:hidden the offset can't be scrolled back by hand, so the
    // page just stayed shifted with the nav toggle riding up over the title.
    //
    // Still never resets while the keyboard is up: that's the height guard's job,
    // and the retries only re-test it. ~3s is far longer than a close animation
    // and bounded, so it can't sit spinning.
    const RETRY_MS = 250;
    const MAX_TRIES = 12;

    const attempt = (triesLeft: number) => {
      const h = heightNow();
      tallest = Math.max(tallest, h);
      if (tallest - h > 100) {
        if (triesLeft > 0) {
          timer = setTimeout(() => attempt(triesLeft - 1), RETRY_MS);
        }
        return; // keyboard still up — leave it alone
      }
      const el = document.scrollingElement ?? document.documentElement;
      if (el.scrollTop !== 0) el.scrollTop = 0;
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
    };

    const restore = () => {
      clearTimeout(timer);
      timer = setTimeout(() => attempt(MAX_TRIES), RETRY_MS);
    };

    window.addEventListener("focusout", restore);
    vv?.addEventListener("resize", restore);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focusout", restore);
      vv?.removeEventListener("resize", restore);
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
        <ViewportReset />
        {new URLSearchParams(window.location.search).get("debug") === "scroll" && (
          <ScrollDebug />
        )}

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