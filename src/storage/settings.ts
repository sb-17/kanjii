import type { Settings } from "../types/settingsType";

const STORAGE_KEY = "kanjii:settings";

const DEFAULTS: Settings = { writeMode: "screen", guide: true, writePool: "both" };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
