import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { hydrateProgress } from "./storage/kanjiProgress";
import { hydrateSettings } from "./storage/settings";
import { hydrateUserVocab } from "./storage/userVocab";
import { requestPersistence } from "./storage/db";
import { registerSW } from "virtual:pwa-register";

// Hydrate local data (IndexedDB) into the in-memory caches before the first
// render, so the rest of the app can keep reading storage synchronously.
async function boot() {
  await Promise.all([hydrateProgress(), hydrateSettings(), hydrateUserVocab()]);
  void requestPersistence();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  registerSW({ immediate: true });
}

boot();
