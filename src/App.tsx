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
import UpdateToast from "./components/update-toast/UpdateToast";
import EmptyState from "./components/empty-state/EmptyState";
import Home from "./pages/Home";
import Learn from "./pages/Learn";
import Cards from "./pages/Cards";
import Decks from "./pages/Decks";
import DeckCards from "./pages/DeckCards";
import DeckSettings from "./pages/DeckSettings";
import DeckCardList from "./pages/DeckCardList";
import Practice from "./pages/Practice";
import Write from "./pages/Write";
import KanjiLearn from "./pages/KanjiLearn";
import MyWords from "./pages/MyWords";
import Onboarding from "./pages/Onboarding";
import Read from "./pages/Read";
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
// Also split: it brings its own stylesheet, and it's only reachable by tapping a
// chart on Analytics.
const TrendDetail = lazy(() => import("./pages/TrendDetail"));

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
      // Zero every element that could be holding the offset, not just
      // `scrollingElement`.
      //
      // Evidence from a device (2026-07-30): closing the keyboard took the offset
      // from ~71px to ~33px and left it there. So the reset was running — the
      // height guard had passed — and still didn't clear it, which means it was
      // zeroing the wrong element. `scrollingElement` is <html>, but *both* html
      // and body carry `overflow: hidden` here, and iOS can keep the offset on
      // <body>, where nothing above ever touched it.
      //
      // `scrollTo` as well as the direct assignments because the two don't always
      // route to the same place on iOS. All three are no-ops when already at zero.
      for (const el of [document.documentElement, document.body]) {
        if (el.scrollTop !== 0) el.scrollTop = 0;
        if (el.scrollLeft !== 0) el.scrollLeft = 0;
      }
      window.scrollTo(0, 0);
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

        <div className="app-container">
          <Navigation />

          <main className="app-content">
            <Suspense fallback={<div className="page">Loading…</div>}>
            <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/analytics" element={<Analytics />} />
            {/* One chart, opened up with a span and bucket picker. Lazy: it
                carries its own stylesheet and nobody reaches it without first
                tapping a chart. */}
            <Route path="/analytics/:metric" element={<TrendDetail />} />
            <Route path="/kanji" element={<KanjiList />} />
            <Route path="/map" element={<KanjiMap />} />
            <Route path="/kanji/:char" element={<Kanji />} />
            <Route path="/kanji/:char/write" element={<Write />} />
            <Route path="/kanji/:char/learn" element={<KanjiLearn />} />
            <Route path="/sets" element={<Learn />} />
            <Route path="/sets/:setId" element={<SetDetail />} />
            {/* /cards is the deck list; the two players sit under it. The static
                my-words segment outranks the dynamic one, so it wins regardless
                of declaration order. */}
            <Route path="/cards" element={<Decks />} />
            <Route path="/cards/my-words" element={<Cards />} />
            <Route path="/cards/:deckId" element={<DeckCards />} />
            <Route path="/cards/:deckId/settings" element={<DeckSettings />} />
            <Route path="/cards/:deckId/list" element={<DeckCardList />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/write" element={<Write />} />
            <Route path="/print" element={<Print />} />
            <Route path="/words" element={<MyWords />} />
            <Route path="/read" element={<Read />} />
            <Route path="/start" element={<Onboarding />} />
            <Route path="/word/:key" element={<WordDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<About />} />
            <Route path="/support" element={<Support />} />
            {/* redirects from the old paths */}
            <Route path="/kanji-list" element={<Navigate to="/kanji" replace />} />
            <Route path="/learn" element={<Navigate to="/sets" replace />} />
            <Route path="/my-words" element={<Navigate to="/words" replace />} />
            {/* Without this an unknown path rendered an empty <main> — a blank
                screen with a hamburger. 404.html serves the app for *any* path,
                so a typo or a stale link lands here rather than on a server
                error page. */}
            <Route
              path="*"
              element={
                <div className="page page-center">
                  <EmptyState
                    title="Page not found"
                    message="That link doesn't go anywhere in Kanjii. It may be out of date."
                    actions={[
                      { to: "/", label: "Home" },
                      { to: "/kanji", label: "All kanji" },
                    ]}
                  />
                </div>
              }
            />
            </Routes>
            </Suspense>
          </main>

          {/* Inside .app-container, not next to it: the toast is positioned
              against the shell rather than the viewport (see UpdateToast.css).
              Renders nothing until a new build is waiting. */}
          <UpdateToast />
        </div>
      </Router>
    </ProgressProvider>
  );
}