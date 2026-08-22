import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import {
  hydrateProgress,
  loadKanjiProgress,
  isKnownOrLearning,
} from "./storage/kanjiProgress";
import { hydrateSettings } from "./storage/settings";
import { hydrateUserVocab } from "./storage/userVocab";
import { hydrateEvents, initEventFlush } from "./storage/events";
import { hydrateKanjiSkill } from "./storage/kanjiSkill";
import { hydrateCloudConfig } from "./storage/cloudSync";
import { hydrateDecks } from "./storage/decks";
import { hydrateDeckProgress } from "./storage/deckProgress";
import { hydrateDeckStats } from "./storage/deckStats";
import { requestPersistence } from "./storage/db";
import { prefetchKanjiStrokes } from "./lib/kanjiVg";
import { applyTheme, initThemeSync } from "./storage/theme";
import { registerSW } from "virtual:pwa-register";
import { markUpdateReady } from "./lib/swUpdate";
import BootFailure from "./components/boot-failure/BootFailure";

// How often an open tab asks whether a new build has been deployed.
const UPDATE_CHECK_MS = 60 * 60 * 1000;

// Storage failed to open. Render an explanation instead of the app — never the
// app itself.
//
// Starting on a half-hydrated cache doesn't degrade, it destroys: every storage
// module keeps the whole store in memory and writes all of it back on any
// change, so an app that booted without your progress would overwrite the real
// progress with an empty object the first time you tagged a kanji. A blank page
// is a bad outcome; silently eating a year of study is a much worse one, and
// only one of the two is recoverable. So this path deliberately has no "carry on
// anyway" option.
function renderBootFailure(error: unknown) {
  console.error("Kanjii: storage failed to hydrate", error);
  const el = document.getElementById("root");
  if (el) createRoot(el).render(<BootFailure error={error} />);
}

// Hydrate local data (IndexedDB) into the in-memory caches before the first
// render, so the rest of the app can keep reading storage synchronously.
async function boot() {
  try {
    // The inline script in index.html already set the theme before paint;
    // re-apply (in case storage changed) and keep it in sync with the OS for
    // "system". Inside the try because it runs before anything is on screen —
    // though it reads localStorage, not IndexedDB, so the failure screen below
    // still comes up in the right theme.
    applyTheme();
    initThemeSync();

    await Promise.all([
      hydrateProgress(),
      hydrateSettings(),
      hydrateUserVocab(),
      hydrateEvents(),
      hydrateKanjiSkill(),
      hydrateCloudConfig(),
      hydrateDecks(),
      hydrateDeckProgress(),
      hydrateDeckStats(),
    ]);
  } catch (error) {
    // Scoped to hydration on purpose. This is the step that touches user data
    // and the step that realistically fails — a corrupt store, a browser
    // evicting site data, a quota error in private browsing. Everything below
    // is best-effort and must not be able to trigger this screen, which would
    // report a data problem that hadn't happened.
    renderBootFailure(error);
    return;
  }

  void requestPersistence();
  initEventFlush();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  // Registered here rather than from a component: warmStrokeCache() below waits
  // on `navigator.serviceWorker.ready`, so this has to keep its place in the
  // order — and a component effect would run twice under StrictMode. The waiting
  // worker is handed to the toast instead of being applied; see lib/swUpdate.
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => markUpdateReady(() => void updateSW(true)),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      // An installed PWA can stay open for days, and the browser only checks for
      // a new worker on navigation. Without this poll a deploy goes unnoticed
      // until a cold start, which is why the prompt seemed not to detect new
      // versions. Skipped while offline so it can't spin against a dead network.
      setInterval(() => {
        if (navigator.onLine) void registration.update();
      }, UPDATE_CHECK_MS);
    },
  });

  // Once online and the service worker is in control, warm its cache with the
  // stroke data for every Learning/Known kanji, so writing practice for them
  // works offline without having to open each one first.
  void warmStrokeCache();
}

async function warmStrokeCache() {
  if (typeof navigator === "undefined" || navigator.onLine === false) return;

  // Don't flood a weak or metered connection with the bulk stroke prefetch — it
  // competes for the little bandwidth there is and can make the UI feel laggy.
  // Strokes still load on demand (CacheFirst) when a kanji is actually opened.
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (
    conn &&
    (conn.saveData ||
      conn.effectiveType === "2g" ||
      conn.effectiveType === "slow-2g")
  ) {
    return;
  }

  // Wait for the SW to be active so its CacheFirst rule can store the responses,
  // but don't hang forever if there's no SW (e.g. dev).
  if (navigator.serviceWorker) {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
  }

  const progress = loadKanjiProgress();
  const active = Object.keys(progress).filter((k) =>
    isKnownOrLearning(progress[k]),
  );
  void prefetchKanjiStrokes(active);
}

boot();
