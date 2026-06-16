import type { Settings } from "../types/settingsType";
import { readWithMigration, writeValue } from "./db";

const STORAGE_KEY = "kanjii:settings";

const DEFAULTS: Settings = {
  writeMode: "screen",
  guide: true,
  writePool: "both",
  practiceScope: "smart",
};

// In-memory source of truth, hydrated once at startup (see hydrateSettings).
let cache: Settings = { ...DEFAULTS };

export async function hydrateSettings(): Promise<void> {
  const stored = await readWithMigration<Partial<Settings>>(STORAGE_KEY);
  cache = { ...DEFAULTS, ...stored };
}

export function loadSettings(): Settings {
  return cache;
}

export function saveSettings(settings: Settings): void {
  cache = settings;
  void writeValue(STORAGE_KEY, settings);
}
