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
import { hydrateEvents } from "./storage/events";
import { requestPersistence } from "./storage/db";
import { prefetchKanjiStrokes } from "./lib/kanjiVg";
import { applyTheme, initThemeSync } from "./storage/theme";
import { registerSW } from "virtual:pwa-register";

// Hydrate local data (IndexedDB) into the in-memory caches before the first
// render, so the rest of the app can keep reading storage synchronously.
async function boot() {
  // The inline script in index.html already set the theme before paint; re-apply
  // (in case storage changed) and keep it in sync with the OS for "system".
  applyTheme();
  initThemeSync();

  await Promise.all([
    hydrateProgress(),
    hydrateSettings(),
    hydrateUserVocab(),
    hydrateEvents(),
  ]);
  void requestPersistence();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  registerSW({ immediate: true });

  // Once online and the service worker is in control, warm its cache with the
  // stroke data for every Learning/Known kanji, so writing practice for them
  // works offline without having to open each one first.
  void warmStrokeCache();
}

async function warmStrokeCache() {
  if (typeof navigator === "undefined" || navigator.onLine === false) return;

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
