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

const FIELD_SELECTOR = "input, textarea, [contenteditable]";

// Keyboard handling for the fixed shell. html/body are locked to
// `overflow: hidden` so only .app-content scrolls, and two things follow.
//
// 1. A mobile browser scrolls the *document* to reveal a focused text field when
//    the keyboard opens. With the page locked that offset can never be scrolled
//    back by hand, so it sticks: the fixed nav toggle stays pinned to the viewport
//    while content sits shifted underneath it, surviving navigation (ScrollManager
//    only resets .app-content). So the document gets snapped back whenever it
//    drifts.
// 2. But blocking that also blocks the browser's only way of showing you the field
//    you're typing in — which is why the lower inputs on My words became
//    unreachable. So do the job properly instead: publish how much of the viewport
//    the keyboard covers as `--keyboard-inset` (App.css adds it to .app-content's
//    bottom padding, giving the pane room to scroll a bottom field up past the
//    keyboard), and scroll the focused field into the *visible* strip ourselves.
//
// Where `interactive-widget=resizes-content` is honoured the browser shrinks the
// layout viewport itself, the inset computes to 0, and only the scrolling matters.
function ViewportGuard() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;

    const resetDocumentScroll = () => {
      const el = document.scrollingElement ?? root;
      if (el.scrollTop !== 0) el.scrollTop = 0;
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
    };

    const syncKeyboardInset = () => {
      const inset = vv ? Math.max(0, window.innerHeight - vv.height) : 0;
      root.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
    };

    // Nudge the focused field into the part of the pane the keyboard isn't
    // covering. Deliberately not `scrollIntoView`: that centres within the pane,
    // and where the layout viewport *didn't* shrink the pane is taller than
    // what's actually on screen, so its centre can still sit behind the keyboard.
    const revealFocused = () => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || !el.matches(FIELD_SELECTOR)) return;
      const pane = document.querySelector<HTMLElement>(".app-content");
      if (!pane) return;

      const top = vv?.offsetTop ?? 0;
      const bottom = top + (vv?.height ?? window.innerHeight);
      const rect = el.getBoundingClientRect();
      const margin = 16;

      if (rect.bottom > bottom - margin) {
        pane.scrollTop += rect.bottom - bottom + margin;
      } else if (rect.top < top + margin) {
        pane.scrollTop -= top + margin - rect.top;
      }
    };

    const onViewportChange = () => {
      syncKeyboardInset();
      resetDocumentScroll();
      revealFocused();
    };

    // The keyboard animates in, so the pane settles a beat after focus. focusin is
    // also the only signal when moving between fields with the keyboard already
    // open — that fires no viewport resize, and is exactly the reported case.
    let focusTimer: ReturnType<typeof setTimeout>;
    const onFocusIn = (e: FocusEvent) => {
      if (!(e.target instanceof HTMLElement) || !e.target.matches(FIELD_SELECTOR)) {
        return;
      }
      clearTimeout(focusTimer);
      focusTimer = setTimeout(revealFocused, 300);
    };

    syncKeyboardInset();
    window.addEventListener("scroll", resetDocumentScroll, { passive: true });
    window.addEventListener("focusin", onFocusIn);
    vv?.addEventListener("resize", onViewportChange);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("scroll", resetDocumentScroll);
      window.removeEventListener("focusin", onFocusIn);
      vv?.removeEventListener("resize", onViewportChange);
      root.style.removeProperty("--keyboard-inset");
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