import type { Settings } from "../types/settingsType";

const STORAGE_KEY = "kanjii:settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { kanji: true, vocab: true };
  } catch {
    return { kanji: true, vocab: true };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
