import type { Settings } from "../types/settingsType";
import { readWithMigration, writeValue } from "./db";

const STORAGE_KEY = "kanjii:settings";

const DEFAULTS: Settings = {
  writeMode: "screen",
  guide: true,
  writePool: "both",
  practiceScope: "smart",
  romajiInput: true,
  practiceSentences: true,
  partialAvailability: false,
  newPerDay: 10,
  writeNewPerDay: 10,
  practicePace: 1,
  writePace: 1,
  deckPace: 1,
  missBehaviour: "reset",
  dayCutoffHour: 4,
  deckScope: "due",
  onboardingDismissed: false,
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
